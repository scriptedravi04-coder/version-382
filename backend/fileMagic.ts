// v396: "do the first bytes match the type the browser claimed?" — used by multer uploads (server.ts magicCheck) and
// the base64 upload path in misc_routes.ts (QA S-5: an .exe went into a public bucket that way). Pure.
export const fileLooksLike = (f: any): boolean => {
  const b: Buffer | undefined = f?.buffer; const t = String(f?.mimetype || "");
  if (!b || b.length < 4) return false;
  const hex = b.subarray(0, 12).toString("hex");
  const ascii = b.subarray(0, 12).toString("latin1");
  if (t === "image/jpeg") return hex.startsWith("ffd8ff");
  if (t === "image/png") return hex.startsWith("89504e47");
  if (t === "image/gif") return ascii.startsWith("GIF8");
  if (t === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (t === "application/pdf") return ascii.startsWith("%PDF");
  if (t === "video/mp4" || t === "video/quicktime") return ascii.slice(4, 8) === "ftyp" || ascii.slice(4, 8) === "moov" || ascii.slice(4, 8) === "wide" || ascii.slice(4, 8) === "mdat";
  if (t === "video/x-msvideo" || t === "audio/wav") return ascii.startsWith("RIFF");
  if (t === "application/msword") return hex.startsWith("d0cf11e0");
  if (t.includes("wordprocessingml")) return hex.startsWith("504b0304");
  if (t === "audio/mpeg") return ascii.startsWith("ID3") || hex.startsWith("fff");
  if (t === "audio/webm") return hex.startsWith("1a45dfa3");
  return false;
};

/** v408 (Ravi: "KYC nahi ho raha" — PAN photo from some Android galleries / WhatsApp comes as application/octet-stream or
 *  with no type, and was refused): the real type from the first bytes, or "" if unknown. Pure. */
export const sniffType = (b?: Buffer): string => {
  if (!b || b.length < 12) return "";
  const hex = b.subarray(0, 12).toString("hex");
  const ascii = b.subarray(0, 12).toString("latin1");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("%PDF")) return "application/pdf";
  return "";
};
export const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "image/jpg", "image/pjpeg"]);
