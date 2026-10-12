// packages/core/tests/service-worker-bridge_test.ts
import { describe, it, } from "@std/testing/bdd";
import { assert, assertEquals, } from "@std/assert";
import {
  connectServiceWorkerBridge,
  guessContentType,
  parseRange,
  registerAndConnectServiceWorker,
  registerServiceWorker,
  waitForServiceWorkerActivation,
} from "../src/service-worker/mod.ts";

describe("Service Worker Bridge Utilities", () => {
  describe("guessContentType", () => {
    it("identifica tipos de vídeo comuns", () => {
      assertEquals(guessContentType("movie.mp4",), "video/mp4",);
      assertEquals(guessContentType("clip.webm",), "video/webm",);
      assertEquals(guessContentType("film.mkv",), "video/x-matroska",);
      assertEquals(guessContentType("video.avi",), "video/x-msvideo",);
      assertEquals(guessContentType("raw.mov",), "video/quicktime",);
    });

    it("identifica tipos de áudio comuns", () => {
      assertEquals(guessContentType("song.mp3",), "audio/mpeg",);
      assertEquals(guessContentType("audio.m4a",), "audio/mp4",);
      assertEquals(guessContentType("track.ogg",), "audio/ogg",);
      assertEquals(guessContentType("sound.wav",), "audio/wav",);
    });

    it("identifica imagens e documentos", () => {
      assertEquals(guessContentType("photo.jpg",), "image/jpeg",);
      assertEquals(guessContentType("photo.jpeg",), "image/jpeg",);
      assertEquals(guessContentType("icon.png",), "image/png",);
      assertEquals(guessContentType("graphic.webp",), "image/webp",);
      assertEquals(guessContentType("index.html",), "text/html",);
      assertEquals(guessContentType("data.json",), "application/json",);
      assertEquals(guessContentType("doc.pdf",), "application/pdf",);
    });

    it("retorna fallback para extensão desconhecida", () => {
      assertEquals(
        guessContentType("archive.bin",),
        "application/octet-stream",
      );
      assertEquals(guessContentType("nofileext",), "application/octet-stream",);
    });
  });

  describe("parseRange", () => {
    it("parseia range fechado com sucesso", () => {
      const range = parseRange("bytes=0-499", 1000,);
      assertEquals(range, { start: 0, end: 499, },);
    });

    it("parseia range aberto até o fim do arquivo", () => {
      const range = parseRange("bytes=500-", 1000,);
      assertEquals(range, { start: 500, end: 999, },);
    });

    it("retorna null para headers ausentes ou inválidos", () => {
      assertEquals(parseRange(undefined, 1000,), null,);
      assertEquals(parseRange("", 1000,), null,);
      assertEquals(parseRange("invalid", 1000,), null,);
      assertEquals(parseRange("characters=0-10", 1000,), null,);
    });

    it("retorna null para offsets fora do limite", () => {
      assertEquals(parseRange("bytes=1500-", 1000,), null,);
      assertEquals(parseRange("bytes=800-400", 1000,), null,);
      assertEquals(parseRange("bytes=-10-20", 1000,), null,);
    });
  });

  describe("API Availability: Low-Level vs Intermediate", () => {
    it("exporta opções de baixo nível (controle manual)", () => {
      assert(typeof connectServiceWorkerBridge === "function",);
      assert(typeof waitForServiceWorkerActivation === "function",);
    });

    it("exporta opções intermediárias (caso de uso comum)", () => {
      assert(typeof registerServiceWorker === "function",);
      assert(typeof registerAndConnectServiceWorker === "function",);
    });
  });
});
