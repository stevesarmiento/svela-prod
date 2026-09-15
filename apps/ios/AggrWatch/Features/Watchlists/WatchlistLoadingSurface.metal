#include <metal_stdlib>
using namespace metal;

static float softBand(float distance, float width) {
    float t = distance / width;
    return exp(-0.5f * t * t);
}

// Separate from the native glass/backdrop. Refraction bends the procedural
// lighting surface; the watchlist's labels, logos and chart are never sampled.
[[ stitchable ]] half4 watchlistLoadingSurface(float2 position, float2 size,
                                               float phase, float strength) {
    size = max(size, float2(1.0f));
    float2 uv = position / size;

    // Rounded-rectangle distance and outward normal, in points. This gives the
    // lens a curved bevel that follows the corners as well as the straight edges.
    float radius = min(20.0f, min(size.x, size.y) * 0.5f);
    float2 centered = position - size * 0.5f;
    float2 q = abs(centered) - (size * 0.5f - radius);
    float2 corner = max(q, 0.0f);
    float cornerLength = length(corner);
    float edgeDistance = cornerLength + min(max(q.x, q.y), 0.0f) - radius;
    float2 outward = (cornerLength > 0.001f ? corner / cornerLength
                      : (q.x > q.y ? float2(1.0f, 0.0f) : float2(0.0f, 1.0f))) * sign(centered);
    float bevel = 1.0f - smoothstep(0.0f, 12.0f, max(0.0f, -edgeDistance));
    float3 bevelNormal = normalize(float3(outward * bevel * 1.6f, 1.0f));

    // Swell through the middle, then narrow again before leaving the card.
    // Keep travel fast (the host's 0.5s cycle); give the light itself elasticity.
    float swell = pow(max(0.0f, sin(M_PI_F * phase)), 2.8f);
    float along = uv.y - uv.x;
    float taper = 0.75f + 0.25f * cos(along * 2.0f);
    float width = (0.012f + 0.045f * swell) * taper;

    // A very shallow fixed lens makes the fast highlight bow gently as it passes.
    float a = uv.x * 5.5f + uv.y * 3.0f;
    float b = uv.y * 7.0f - uv.x * 2.0f;
    float2 slope = float2(0.045f * cos(a) - 0.012f * cos(b),
                         0.025f * cos(a) + 0.035f * cos(b));
    float3 normal = normalize(float3(-slope * (0.6f + swell), 1.0f));
    float3 incident = float3(0.0f, 0.0f, -1.0f);
    // Sample the imagined light behind the surface through a thicker perimeter.
    // Point-based displacement keeps the bend consistent across card sizes.
    float2 lensDepth = float2(26.0f) / size;
    float2 refracted = uv + refract(incident, normal, 1.0f / 1.46f).xy * 0.7f
                        + refract(incident, bevelNormal, 1.0f / 1.46f).xy * lensDepth;
    float2 direction = float2(0.62f, 0.38f);
    float center = mix(-0.3f, 1.3f, phase);
    float bow = 0.024f * swell * sin(along * 3.4f + phase * M_PI_F);
    float distance = dot(refracted, direction) - center + bow;

    float glow = softBand(distance, (0.045f + 0.14f * swell) * taper);
    float highlight = softBand(distance, width);

    // Small wavelength separation along the trailing caustic, rather than a
    // rainbow wash over the entire card. All colors remain premultiplied.
    float red = dot(uv + refract(incident, normal, 1.0f / 1.44f).xy * 0.7f
                    + refract(incident, bevelNormal, 1.0f / 1.40f).xy * lensDepth, direction) - center + bow;
    float blue = dot(uv + refract(incident, normal, 1.0f / 1.48f).xy * 0.7f
                     + refract(incident, bevelNormal, 1.0f / 1.52f).xy * lensDepth, direction) - center + bow;
    float trailing = width * 1.45f;
    float dispersion = 0.008f + 0.013f * swell;
    float prismWidth = 0.008f + 0.012f * swell;
    float3 prism = float3(softBand(red - trailing - dispersion, prismWidth),
                         softBand(distance - trailing, prismWidth),
                         softBand(blue - trailing + dispersion, prismWidth));

    // Concentrate the refracted light just inside the lip. It only lights up
    // where the sweep crosses the perimeter, never as a permanent glowing ring.
    float lip = softBand(edgeDistance + 1.1f, 0.85f);
    float rim = lip * softBand(distance, width * 1.3f);
    float3 edgePrism = float3(softBand(red, width * 0.75f),
                             softBand(distance, width * 0.75f),
                             softBand(blue, width * 0.75f)) * lip;

    float visibility = smoothstep(0.03f, 0.15f, phase) * (1.0f - smoothstep(0.83f, 0.98f, phase));
    float3 light = float3(0.045f * glow + 0.105f * highlight + 0.14f * rim)
                   + 0.075f * prism + 0.12f * edgePrism;
    light = min(light, float3(0.34f)) * saturate(strength) * visibility;
    float alpha = max(light.r, max(light.g, light.b));
    return half4(half3(light), half(alpha));
}
