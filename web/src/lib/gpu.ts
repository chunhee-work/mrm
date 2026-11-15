/**
 * Is there a graphics card to draw live 3D on?
 *
 * A browser without one still offers WebGL, drawn on the processor (SwiftShader, llvmpipe, a "software" or "basic"
 * renderer). That is far too slow for a moving scene: seconds per frame, and the page stops answering. Those machines,
 * and automated browsers, get the still pictures instead.
 */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** True for the renderer names browsers give when the picture is drawn on the processor. */
export const isSoftwareRenderer = (name: string) => SOFTWARE.test(name);

/**
 * Ask the browser, quietly, before any 3D code is loaded. `allowSoftware` is for the scripts that render the still
 * pictures themselves: they drive a browser with no graphics card and wait for every frame.
 */
export function canDrawLive3D(allowSoftware = false): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: !allowSoftware });
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String((info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null) ?? gl.getParameter(gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return allowSoftware || !isSoftwareRenderer(name);
  } catch {
    return false;
  }
}
