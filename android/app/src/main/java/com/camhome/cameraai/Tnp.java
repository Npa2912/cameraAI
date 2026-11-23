package com.camhome.cameraai;

// Stock TNP wire format adapted from YI Local contributors (MIT).
import android.os.SystemClock;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.*;
import java.util.function.BooleanSupplier;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class Tnp implements AutoCloseable {
    static long now() { return SystemClock.elapsedRealtime(); }
    private static int u(byte[] data, int i) { return data[i] & 255; }
    private static int word(byte[] data, int i) { return u(data, i) << 8 | u(data, i + 1); }
    private static long uint(byte[] data, int i) {
        return Integer.toUnsignedLong(ByteBuffer.wrap(data, i, 4).getInt());
    }
    private static byte[] packet(int kind) { return packet(kind, new byte[0]); }
    private static byte[] packet(int kind, byte[] body) {
        return ByteBuffer.allocate(4 + body.length).put((byte) 0xf1).put((byte) kind)
            .putShort((short) body.length).put(body).array();
    }
    private static String hex(byte[] data, int offset, int length) {
        char[] output = new char[length * 2];
        for (int i = 0; i < length; i++) {
            int value = u(data, offset + i);
            output[i * 2] = Character.forDigit(value >>> 4, 16);
            output[i * 2 + 1] = Character.forDigit(value & 15, 16);
        }
        return new String(output);
    }
    private static InetAddress lan(String ip) throws UnknownHostException {
        String[] parts = ip.split("\\.", -1);
        if (parts.length != 4) throw new IllegalArgumentException();
        byte[] bytes = new byte[4];
        for (int i = 0; i < parts.length; i++) {
            if (!parts[i].matches("[0-9]{1,3}")) throw new IllegalArgumentException();
            int value = Integer.parseInt(parts[i]);
            if (value > 255) throw new IllegalArgumentException();
            bytes[i] = (byte) value;
        }
        InetAddress address = InetAddress.getByAddress(bytes);
        if (!address.isSiteLocalAddress() && !address.isLinkLocalAddress())
            throw new IllegalArgumentException();
        return address;
    }
    private static Set<InetAddress> targets() throws IOException {
        Set<InetAddress> addresses = new HashSet<>();
        addresses.add(InetAddress.getByName("255.255.255.255"));
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        if (interfaces == null) return addresses;
        while (interfaces.hasMoreElements()) {
            NetworkInterface network = interfaces.nextElement();
            if (!network.isUp() || network.isLoopback()) continue;
            for (InterfaceAddress entry : network.getInterfaceAddresses()) {
                if (entry.getBroadcast() != null) addresses.add(entry.getBroadcast());
            }
        }
        return addresses;
    }
    private static void discover(DatagramSocket socket, Set<InetAddress> targets) {
        byte[] data = packet(0x30);
        for (InetAddress target : targets) {
            try { socket.send(new DatagramPacket(data, data.length, target, 32108)); }
            catch (IOException ignored) { }
        }
    }
    private static boolean hello(byte[] data, int length) {
        return length >= 24 && u(data, 0) == 0xf1 && u(data, 1) == 0x41 &&
            word(data, 2) == length - 4;
    }
    private static boolean receive(DatagramSocket socket, DatagramPacket buffer) throws IOException {
        buffer.setLength(buffer.getData().length);
        try { socket.receive(buffer); return true; }
        catch (SocketTimeoutException ignored) { return false; }
    }
    static Map<String, String> scan() throws IOException {
        Map<String, String> found = new LinkedHashMap<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setBroadcast(true);
            socket.setSoTimeout(150);
            Set<InetAddress> addresses = targets();
            byte[] data = new byte[65535];
            DatagramPacket buffer = new DatagramPacket(data, data.length);
            long deadline = now() + 2000;
            long next = 0;
            while (!Thread.currentThread().isInterrupted() && now() < deadline) {
                if (now() >= next) {
                    discover(socket, addresses);
                    next = now() + 500;
                }
                if (!receive(socket, buffer) || !hello(data, buffer.getLength())) continue;
                String ip = buffer.getAddress().getHostAddress();
                try { lan(ip); }
                catch (IllegalArgumentException ignored) { continue; }
                found.put(hex(data, 4, 20), ip);
            }
        }
        return found;
    }

    static final class AuthException extends IOException {
        final long result;
        AuthException(long result) { this.result = result; }
    }

    static final class ProtocolException extends IOException { }

    static final class Timeout extends SocketTimeoutException {
        final String stage;
        Timeout(String stage) { this.stage = stage; }
    }
    static final class Frame {
        final byte[] data;
        final int seq, width, height, generation;
        final boolean key;
        final long seconds, millis;
        Frame(byte[] data, byte[] header, boolean key) {
            this.data = data;
            this.key = key;
            generation = u(header, 5);
            seq = word(header, 6);
            width = word(header, 8);
            height = word(header, 10);
            seconds = uint(header, 12);
            millis = uint(header, 20);
        }
    }
    interface Frames { void frame(Frame frame) throws IOException; }
    private interface Messages {
        void message(int kind, int ability, byte[] body) throws IOException, GeneralSecurityException;
    }
    private static final class Channel {
        private int expected;
        private final Map<Integer, byte[]> pending = new HashMap<>();
        private final ByteArrayOutputStream stream = new ByteArrayOutputStream();

        void feed(int seq, byte[] data, Messages messages) throws IOException, GeneralSecurityException {
            int distance = (seq - expected) & 65535;
            if (distance >= 32768) return;
            if (distance > 1024) throw new IOException();
            pending.putIfAbsent(seq, data);
            if (seq != expected) return;
            byte[] part;
            while ((part = pending.remove(expected)) != null) {
                stream.write(part, 0, part.length);
                expected = (expected + 1) & 65535;
            }
            byte[] all = stream.toByteArray();
            int offset = 0;
            while (all.length - offset >= 8) {
                int version = u(all, offset);
                int kind = u(all, offset + 1);
                long size = uint(all, offset + 4);
                if (version < 1 || version > 3 || kind < 1 || kind > 3 || size > 8_388_608)
                    throw new ProtocolException();
                if (all.length - offset - 8 < size) break;
                int end = offset + 8 + (int) size;
                messages.message(kind, u(all, offset + 2), Arrays.copyOfRange(all, offset + 8, end));
                offset = end;
            }
            if (offset > 0) {
                stream.reset();
                stream.write(all, offset, all.length - offset);
            }
        }
    }
    private static final class Pending {
        final byte[] data;
        long sent;
        int retries;
        Pending(byte[] data) { this.data = data; sent = now(); }
    }

    private final InetAddress address;
    private final String uid;
    private final Mac hmac;
    private final Cipher cipher;
    private final SecureRandom random = new SecureRandom();
    private final String noncePrefix = randomHex(4).substring(0, 7);
    private final DatagramSocket socket;
    private final byte[] data = new byte[65535];
    private final DatagramPacket buffer = new DatagramPacket(data, data.length);
    private final Channel[] channels = new Channel[6];
    private final Map<Integer, Pending> unacked = new HashMap<>();
    private InetSocketAddress peer;
    private String cameraUid;
    private int sequence;
    private boolean awaitingAuth, authenticated;
    private long lastPacket;

    Tnp(String ip, String uid, String key) throws IOException, GeneralSecurityException {
        address = lan(ip);
        this.uid = uid;
        byte[] secret = key.getBytes(StandardCharsets.UTF_8);
        if (secret.length != 15 || (!uid.isEmpty() && !uid.matches("[a-f0-9]{40}")))
            throw new IllegalArgumentException();
        hmac = Mac.getInstance("HmacSHA1");
        hmac.init(new SecretKeySpec(secret, "HmacSHA1"));
        cipher = Cipher.getInstance("AES/ECB/NoPadding");
        byte[] aes = Arrays.copyOf(secret, 16);
        aes[15] = '0';
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(aes, "AES"));
        Arrays.fill(secret, (byte) 0);
        Arrays.fill(aes, (byte) 0);
        for (int i = 0; i < channels.length; i++) channels[i] = new Channel();
        socket = new DatagramSocket();
    }

    String cameraUid() { return cameraUid; }

    private void send(byte[] wire) throws IOException {
        if (peer == null) throw new IOException();
        socket.send(new DatagramPacket(wire, wire.length, peer));
    }

    void handshake(BooleanSupplier active) throws IOException {
        socket.setBroadcast(true);
        socket.setReceiveBufferSize(4 * 1024 * 1024);
        socket.setSoTimeout(150);
        Set<InetAddress> addresses = targets();
        addresses.add(address);
        long deadline = now() + 5000;
        long next = 0;
        byte[] response = null;
        while (active.getAsBoolean() && now() < deadline) {
            if (now() >= next) {
                if (response == null) discover(socket, addresses);
                else send(response);
                next = now() + (response == null ? 500 : 150);
            }
            if (!receive(socket, buffer)) continue;
            InetSocketAddress source = (InetSocketAddress) buffer.getSocketAddress();
            if (response == null && hello(data, buffer.getLength())) {
                String candidate = hex(data, 4, 20);
                if (uid.isEmpty() ? !source.getAddress().equals(address) : !uid.equals(candidate)) continue;
                try { lan(source.getAddress().getHostAddress()); }
                catch (IllegalArgumentException ignored) { continue; }
                cameraUid = candidate;
                peer = source;
                response = packet(0x41, Arrays.copyOfRange(data, 4, 24));
                send(response);
            } else if (source.equals(peer) && buffer.getLength() >= 4 &&
                u(data, 0) == 0xf1 && u(data, 1) == 0x42) {
                lastPacket = now();
                return;
            }
        }
        throw new Timeout(peer == null ? "discovery_timeout" : "handshake_timeout");
    }

    private String randomHex(int length) {
        byte[] value = new byte[length];
        random.nextBytes(value);
        return hex(value, 0, length);
    }

    private void command(int cmd, byte[] payload) throws IOException {
        int seq = sequence++ & 65535;
        String nonce = noncePrefix + randomHex(4);
        byte[] signature = Base64.encode(hmac.doFinal(
            ("user=xiaoyiuser&nonce=" + nonce).getBytes(StandardCharsets.US_ASCII)), Base64.NO_WRAP);
        byte[] auth = ByteBuffer.allocate(32).put(nonce.getBytes(StandardCharsets.US_ASCII))
            .put((byte) ',').put(signature, 0, 15).array();
        byte[] message = ByteBuffer.allocate(52 + payload.length)
            .put((byte) 0xd1).put((byte) 0).putShort((short) seq)
            .put(new byte[] {2, 3, 0, 0}).putInt(40 + payload.length)
            .putShort((short) cmd).putShort((short) (seq + 1)).putShort((short) 0)
            .putShort((short) payload.length).put(auth).put(payload).array();
        byte[] wire = packet(0xd0, message);
        send(wire);
        unacked.put(seq, new Pending(wire));
    }

    void authenticate(BooleanSupplier active) throws IOException, GeneralSecurityException {
        awaitingAuth = true;
        command(0x1300, new byte[0]);
        long deadline = now() + 4000;
        while (active.getAsBoolean() && !authenticated && now() < deadline) pump(frame -> {});
        awaitingAuth = false;
        if (!authenticated) throw new Timeout("auth_timeout");
    }

    void startVideo() throws IOException { command(0x2345, new byte[] {1, 1, 1, 0}); }
    void move(int direction) throws IOException {
        command(0x4012, ByteBuffer.allocate(8).putInt(direction).putInt(0).array());
    }
    void stopMove() throws IOException { command(0x4013, new byte[4]); }

    void pump(Frames frames) throws IOException, GeneralSecurityException {
        if (receive(socket, buffer) && buffer.getSocketAddress().equals(peer)) {
            int length = buffer.getLength();
            if (length >= 4 && u(data, 0) == 0xf1 && word(data, 2) == length - 4) {
                lastPacket = now();
                int kind = u(data, 1);
                if (kind == 0xe0) send(packet(0xe1));
                if (kind == 0xf0) throw new IOException();
                if (length >= 8 && u(data, 4) == 0xd1) {
                    int channel = u(data, 5);
                    if (kind == 0xd1 && channel == 0 && length == 8 + 2 * word(data, 6)) {
                        for (int i = 8; i < length; i += 2) unacked.remove(word(data, i));
                    }
                    if (kind == 0xd0 && channel < channels.length) {
                        int seq = word(data, 6);
                        byte[] ack = ByteBuffer.allocate(6).put((byte) 0xd1).put((byte) channel)
                            .putShort((short) 1).putShort((short) seq).array();
                        send(packet(0xd1, ack));
                        channels[channel].feed(seq, Arrays.copyOfRange(data, 8, length),
                            (type, ability, body) -> message(channel, type, ability, body, frames));
                    }
                }
            }
        }
        long time = now();
        if (time - lastPacket > 10_000) throw new SocketTimeoutException();
        for (Pending pending : unacked.values()) {
            if (time - pending.sent < 300) continue;
            if (pending.retries++ >= 12) {
                if (awaitingAuth) throw new Timeout("auth_timeout");
                throw new SocketTimeoutException();
            }
            send(pending.data);
            pending.sent = time;
        }
    }

    private void message(int channel, int kind, int ability, byte[] body, Frames frames)
            throws IOException, GeneralSecurityException {
        if (kind == 3 && awaitingAuth && channel == 0) {
            if (body.length < 40) throw new ProtocolException();
            if (word(body, 2) != 1) return;
            if (40 + word(body, 4) + word(body, 6) > body.length) throw new ProtocolException();
            long result = uint(body, 8);
            if (result != 0) throw new AuthException(result);
            if (word(body, 0) == 0x1301) {
                if (ability != 0) throw new ProtocolException();
                authenticated = true;
            }
        }
        if (kind != 1 || !authenticated || body.length <= 24) return;
        if (word(body, 0) != 0x4e) throw new IOException();
        boolean key = channel == 2 || channel == 4;
        byte[] frame = Arrays.copyOfRange(body, 24, body.length);
        if (key && frame.length >= 36)
            System.arraycopy(cipher.doFinal(frame, 4, 32), 0, frame, 4, 32);
        frames.frame(new Frame(frame, body, key));
    }

    @Override public void close() {
        if (peer != null) {
            try { send(packet(0xf0)); }
            catch (IOException ignored) { }
        }
        socket.close();
    }
}
