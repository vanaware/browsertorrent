/**
 * @browsertorrent/tests/integration/smoke_test.ts
 *
 * Smoke test: verifica que os pacotes principais são importáveis
 * e que a estrutura básica do workspace está saudável.
 */

import { assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { join, resolve } from "@std/path";

const ROOT = resolve(Deno.cwd());

describe("smoke", () => {
  it("deve ser possível carregar o módulo core", async () => {
    const coreMod = await import(join(ROOT, "packages/core/src/mod.ts"));
    assert(typeof coreMod.CORE_VERSION === "string", "core deve exportar CORE_VERSION");
  });
});