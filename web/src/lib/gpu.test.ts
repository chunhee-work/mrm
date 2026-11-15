import test from "node:test";
import assert from "node:assert/strict";
import { isSoftwareRenderer } from "./gpu";

test("renderers that draw on the processor are recognised, real graphics cards are not", () => {
  for (const name of [
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "Google SwiftShader",
    "Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)",
    "Gallium 0.4 on softpipe",
    "Apple Software Renderer",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ]) assert.equal(isSoftwareRenderer(name), true, name);
  for (const name of [
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Adreno (TM) 650",
    "Mali-G78",
    "Apple GPU",
    "",
  ]) assert.equal(isSoftwareRenderer(name), false, name);
});
