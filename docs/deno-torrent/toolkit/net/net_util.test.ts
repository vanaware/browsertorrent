import { assertEquals, assertThrows } from '@std/assert';
import { NetUtil } from '../../mod.ts';

Deno.test('isNetPort', () => {
  assertEquals(NetUtil.isNetPort(0), true);
  assertEquals(NetUtil.isNetPort(65535), true);
  assertEquals(NetUtil.isNetPort(65536), false);
  assertEquals(NetUtil.isNetPort(-1), false);
});

Deno.test('isWellKnownPort', () => {
  assertEquals(NetUtil.isWellKnownPort(0), true);
  assertEquals(NetUtil.isWellKnownPort(1023), true);
  assertEquals(NetUtil.isWellKnownPort(1024), false);
  assertEquals(NetUtil.isWellKnownPort(65535), false);
  assertEquals(NetUtil.isWellKnownPort(-1), false);
});

Deno.test('isRegisteredPort', () => {
  assertEquals(NetUtil.isRegisteredPort(0), false);
  assertEquals(NetUtil.isRegisteredPort(1023), false);
  assertEquals(NetUtil.isRegisteredPort(1024), true);
  assertEquals(NetUtil.isRegisteredPort(49151), true);
  assertEquals(NetUtil.isRegisteredPort(49152), false);
  assertEquals(NetUtil.isRegisteredPort(65535), false);
  assertEquals(NetUtil.isRegisteredPort(-1), false);
});

Deno.test('isDynamicPort', () => {
  assertEquals(NetUtil.isDynamicPort(0), false);
  assertEquals(NetUtil.isDynamicPort(1023), false);
  assertEquals(NetUtil.isDynamicPort(1024), false);
  assertEquals(NetUtil.isDynamicPort(49151), false);
  assertEquals(NetUtil.isDynamicPort(49152), true);
  assertEquals(NetUtil.isDynamicPort(65535), true);
  assertEquals(NetUtil.isDynamicPort(-1), false);
});

Deno.test('isIPv4Str', () => {
  assertEquals(NetUtil.isIPv4Str('0.0.0.0'), true);
  assertEquals(NetUtil.isIPv4Str('255.255.255.255'), true);
  assertEquals(NetUtil.isIPv4Str('192.168.1.1'), true);
  assertEquals(NetUtil.isIPv4Str(''), false);
  assertEquals(NetUtil.isIPv4Str('192.168.1.256'), false);
  assertEquals(NetUtil.isIPv4Str('192.168.1'), false);
  assertEquals(NetUtil.isIPv4Str('256.256.256.256'), false);
  assertEquals(NetUtil.isIPv4Str('0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0.0'), false);
  assertEquals(NetUtil.isIPv4Str('0.0.0.0.0'), false);
  assertEquals(NetUtil.isIPv4Str('192'), false);
  assertEquals(NetUtil.isIPv4Str('192.168'), false);
  assertEquals(NetUtil.isIPv4Str('192.168.001.001'), false);
});

Deno.test('isIPv4Bytes', () => {
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([0, 0, 0, 0])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([255, 255, 255, 255])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 1])), true);
  // [192, 168, 1, 256] 256 will overflow to 0
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 256])), true);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([])), false);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1])), false);
  assertEquals(NetUtil.isIPv4Bytes(new Uint8Array([192, 168, 1, 1, 1])), false);
});

Deno.test('isDomain', () => {
  assertEquals(NetUtil.isDomain('google.com'), true);
  assertEquals(NetUtil.isDomain('www.google.com'), true);
  assertEquals(NetUtil.isDomain('test.test.google.com'), true);
  assertEquals(NetUtil.isDomain(''), false);
  assertEquals(NetUtil.isDomain(), false);
  assertEquals(NetUtil.isDomain('google'), false);
  assertEquals(NetUtil.isDomain('google.'), false);
  assertEquals(NetUtil.isDomain('-google.com'), false);
  assertEquals(NetUtil.isDomain('google-.com'), false);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(64)}.com`), false);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(63)}.com`), true);
  assertEquals(NetUtil.isDomain(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.com`), true);
  assertEquals(
    NetUtil.isDomain(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}.com`),
    false,
  );
});

Deno.test('bytes2IPv4Str', () => {
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([0, 0, 0, 0])), '0.0.0.0');
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([255, 255, 255, 255])), '255.255.255.255');
  assertEquals(NetUtil.bytes2IPv4Str(new Uint8Array([192, 168, 1, 1])), '192.168.1.1');
  assertEquals(NetUtil.bytes2IPv4Str(undefined), undefined);
});

Deno.test('str2IPv4Bytes', () => {
  assertEquals(NetUtil.ipv4Str2Bytes('0.0.0.0'), new Uint8Array([0, 0, 0, 0]));
  assertEquals(NetUtil.ipv4Str2Bytes('255.255.255.255'), new Uint8Array([255, 255, 255, 255]));
  assertEquals(NetUtil.ipv4Str2Bytes(undefined), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes(''), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes('192.168.1.256'), undefined);
  assertEquals(NetUtil.ipv4Str2Bytes('192.168.1'), undefined);
});

Deno.test('compact IPv4 endpoint conversions', () => {
  const compact = NetUtil.ipv4EndpointToCompact('127.0.0.1', 6881);
  assertEquals(compact, new Uint8Array([127, 0, 0, 1, 0x1a, 0xe1]));
  assertEquals(NetUtil.compactIPv4ToEndpoint(compact), { host: '127.0.0.1', port: 6881 });
  assertEquals(NetUtil.compactIPv4ToEndpoint(new Uint8Array([192, 168, 1, 2, 0, 0])), {
    host: '192.168.1.2',
    port: 0,
  });
  assertThrows(() => NetUtil.ipv4EndpointToCompact('not-an-ip', 6881), TypeError);
  assertThrows(() => NetUtil.ipv4EndpointToCompact('127.0.0.1', 65536), RangeError);
  assertThrows(() => NetUtil.compactIPv4ToEndpoint(new Uint8Array(5)), RangeError);
  assertThrows(() => NetUtil.compactIPv4ToEndpoint(new Uint8Array(7)), RangeError);
});

Deno.test('getMacAddr', () => {
  const result = NetUtil.getMacAddr();
  if (result === undefined) return;
  // each entry must be a valid lowercase colon-separated MAC
  const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
  for (const mac of result) {
    assertEquals(macRegex.test(mac), true);
  }
  // no zero MAC
  assertEquals(result.includes('00:00:00:00:00:00'), false);
  // no duplicates
  assertEquals(result.length, new Set(result).size);
  // sorted
  assertEquals(result, [...result].sort());
});
