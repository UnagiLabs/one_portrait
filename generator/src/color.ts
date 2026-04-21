import type { MosaicRgb } from "@one-portrait/shared";

type LabColor = {
  readonly l: number;
  readonly a: number;
  readonly b: number;
};

export function deltaE(left: MosaicRgb, right: MosaicRgb): number {
  const leftLab = rgbToLab(left);
  const rightLab = rgbToLab(right);

  return Math.sqrt(
    (leftLab.l - rightLab.l) ** 2 +
      (leftLab.a - rightLab.a) ** 2 +
      (leftLab.b - rightLab.b) ** 2,
  );
}

function rgbToLab(rgb: MosaicRgb): LabColor {
  const xyz = rgbToXyz(rgb);

  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

function rgbToXyz(rgb: MosaicRgb): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  const red = srgbToLinear(rgb.red / 255);
  const green = srgbToLinear(rgb.green / 255);
  const blue = srgbToLinear(rgb.blue / 255);

  return {
    x: red * 0.4124564 + green * 0.3575761 + blue * 0.1804375,
    y: red * 0.2126729 + green * 0.7151522 + blue * 0.072175,
    z: red * 0.0193339 + green * 0.119192 + blue * 0.9503041,
  };
}

function xyzToLab(x: number, y: number, z: number): LabColor {
  const white = {
    x: 0.95047,
    y: 1,
    z: 1.08883,
  };
  const fx = xyzToLabComponent(x / white.x);
  const fy = xyzToLabComponent(y / white.y);
  const fz = xyzToLabComponent(z / white.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function srgbToLinear(value: number): number {
  if (value <= 0.04045) {
    return value / 12.92;
  }

  return ((value + 0.055) / 1.055) ** 2.4;
}

function xyzToLabComponent(value: number): number {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;

  if (value > epsilon) {
    return value ** (1 / 3);
  }

  return (kappa * value + 16) / 116;
}
