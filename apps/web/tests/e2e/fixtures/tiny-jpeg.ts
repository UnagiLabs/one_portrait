/**
 * 1x1-pixel black JPEG used as a Playwright `setInputFiles` payload. Embedded
 * as base64 so no binary blob has to be committed to the repo. Chromium decodes
 * this fine via `createImageBitmap`, which is all `preprocessPhoto` needs.
 */
const TINY_JPEG_BASE64 =
  "/9j/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/" +
  "2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/" +
  "wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/" +
  "xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWADpZb//Z";

export const TINY_JPEG_BUFFER = Buffer.from(TINY_JPEG_BASE64, "base64");
export const TINY_JPEG_MIME = "image/jpeg";
export const TINY_JPEG_NAME = "stub-photo.jpg";
