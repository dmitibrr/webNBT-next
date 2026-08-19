//
//  nbt_utils.cpp
//  webNBT next
//
//  Implementation of the NBT codec.
//

#include "nbt_utils.h"

#include <cstring>

using emscripten::val;

namespace nbt {

namespace {

  // ---- ByteReader (bounds-checked, no exceptions) ----

  struct ByteReader {
    const uint8_t *data;
    size_t size;
    size_t pos = 0;

    ByteReader(const uint8_t *d, size_t s) : data(d), size(s) {}

    bool take(void *out, size_t n) {
      if (pos + n > size) return false;
      if (n) memcpy(out, data + pos, n);
      pos += n;
      return true;
    }

    bool takeByte(uint8_t &b) { return take(&b, 1); }
    size_t remaining() const { return size - pos; }
  };

  // ---- ByteWriter (simple growing buffer) ----

  struct ByteWriter {
    std::string out;

    void put(const void *p, size_t n) { out.append((const char *)p, n); }
    void putByte(uint8_t b) { out.push_back((char)b); }
  };

  // ---- big-endian helpers ----

  void putU16(ByteWriter &w, uint16_t v) {
    uint8_t b[2] = { (uint8_t)(v >> 8), (uint8_t)(v & 0xFF) };
    w.put(b, 2);
  }
  bool getU16(ByteReader &r, uint16_t &out) {
    uint8_t b[2];
    if (!r.take(b, 2)) return false;
    out = (uint16_t)((b[0] << 8) | b[1]);
    return true;
  }
  void putU32(ByteWriter &w, uint32_t v) {
    uint8_t b[4] = { (uint8_t)(v >> 24), (uint8_t)(v >> 16), (uint8_t)(v >> 8), (uint8_t)(v & 0xFF) };
    w.put(b, 4);
  }
  bool getU32(ByteReader &r, uint32_t &out) {
    uint8_t b[4];
    if (!r.take(b, 4)) return false;
    out = ((uint32_t)b[0] << 24) | ((uint32_t)b[1] << 16) | ((uint32_t)b[2] << 8) | (uint32_t)b[3];
    return true;
  }
  void putU64(ByteWriter &w, uint64_t v) {
    uint8_t b[8];
    for (int i = 7; i >= 0; --i) { b[i] = (uint8_t)(v & 0xFF); v >>= 8; }
    w.put(b, 8);
  }
  bool getU64(ByteReader &r, uint64_t &out) {
    uint8_t b[8];
    if (!r.take(b, 8)) return false;
    uint64_t v = 0;
    for (int i = 0; i < 8; ++i) v = (v << 8) | b[i];
    out = v;
    return true;
  }

  // ---- modified UTF-8 (Java) <-> standard UTF-8 ----

  void appendModifiedUTF8(ByteWriter &w, uint16_t unit) {
    if (unit >= 0x0001 && unit <= 0x007F) {
      w.putByte((uint8_t)unit);
    } else if (unit <= 0x07FF) {
      w.putByte((uint8_t)(0xC0 | (unit >> 6)));
      w.putByte((uint8_t)(0x80 | (unit & 0x3F)));
    } else {
      w.putByte((uint8_t)(0xE0 | (unit >> 12)));
      w.putByte((uint8_t)(0x80 | ((unit >> 6) & 0x3F)));
      w.putByte((uint8_t)(0x80 | (unit & 0x3F)));
    }
  }

  std::string toModifiedUTF8(const std::string &u) {
    ByteWriter w;
    size_t i = 0;
    size_t n = u.size();
    while (i < n) {
      uint32_t c = (uint8_t)u[i++];
      if (c < 0x80) {
        w.putByte((uint8_t)c);
      } else if ((c >> 5) == 0x06) {
        uint32_t cp = ((c & 0x1F) << 6) | ((uint8_t)u[i++] & 0x3F);
        appendModifiedUTF8(w, (uint16_t)cp);
      } else if ((c >> 4) == 0x0E) {
        uint32_t cp = ((c & 0x0F) << 12) | (((uint8_t)u[i] & 0x3F) << 6) | ((uint8_t)u[i + 1] & 0x3F);
        i += 2;
        appendModifiedUTF8(w, (uint16_t)cp);
      } else {
        uint32_t cp = ((c & 0x07) << 18) | (((uint8_t)u[i] & 0x3F) << 12) |
                      (((uint8_t)u[i + 1] & 0x3F) << 6) | ((uint8_t)u[i + 2] & 0x3F);
        i += 3;
        cp -= 0x10000;
        appendModifiedUTF8(w, (uint16_t)(0xD800 + (cp >> 10)));
        appendModifiedUTF8(w, (uint16_t)(0xDC00 + (cp & 0x3FF)));
      }
    }
    return w.out;
  }

  void appendStandardUTF8(std::string &out, uint32_t cp) {
    if (cp < 0x80) out.push_back((char)cp);
    else if (cp < 0x800) {
      out.push_back((char)(0xC0 | (cp >> 6)));
      out.push_back((char)(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back((char)(0xE0 | (cp >> 12)));
      out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back((char)(0x80 | (cp & 0x3F)));
    } else {
      out.push_back((char)(0xF0 | (cp >> 18)));
      out.push_back((char)(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back((char)(0x80 | (cp & 0x3F)));
    }
  }

  std::string fromModifiedUTF8(const uint8_t *p, size_t n) {
    std::string out;
    out.reserve(n);
    size_t i = 0;
    while (i < n) {
      uint8_t b = p[i++];
      if (b < 0x80) {
        out.push_back((char)b);
      } else if ((b >> 5) == 0x06) {
        appendStandardUTF8(out, ((b & 0x1F) << 6) | (p[i++] & 0x3F));
      } else if ((b >> 4) == 0x0E) {
        uint32_t half = ((b & 0x0F) << 12) | ((p[i] & 0x3F) << 6) | (p[i + 1] & 0x3F);
        i += 2;
        if (half >= 0xD800 && half <= 0xDBFF && i + 2 <= n) {
          uint8_t lb = p[i];
          if ((lb >> 4) == 0x0E) {
            uint32_t low = ((lb & 0x0F) << 12) | ((p[i + 1] & 0x3F) << 6) | (p[i + 2] & 0x3F);
            if (low >= 0xDC00 && low <= 0xDFFF) {
              appendStandardUTF8(out, 0x10000 + ((half - 0xD800) << 10) + (low - 0xDC00));
              i += 3;
              continue;
            }
          }
        }
        appendStandardUTF8(out, half);
      } else {
        appendStandardUTF8(out, 0xFFFD);
      }
    }
    return out;
  }

  // ---- base64 ----

  const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  std::string toBase64(const uint8_t *p, size_t n) {
    std::string out;
    out.reserve(((n + 2) / 3) * 4);
    for (size_t i = 0; i < n; i += 3) {
      uint32_t v = ((uint32_t)p[i] << 16);
      if (i + 1 < n) v |= ((uint32_t)p[i + 1] << 8);
      if (i + 2 < n) v |= (uint32_t)p[i + 2];
      out.push_back(B64[(v >> 18) & 63]);
      out.push_back(B64[(v >> 12) & 63]);
      out.push_back(i + 1 < n ? B64[(v >> 6) & 63] : '=');
      out.push_back(i + 2 < n ? B64[v & 63] : '=');
    }
    return out;
  }

  int b64val(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
  }

  std::vector<uint8_t> fromBase64(const std::string &s) {
    std::vector<uint8_t> out;
    int acc = 0, bits = 0;
    for (char c : s) {
      if (c == '=' || c == '\n' || c == ' ') continue;
      int v = b64val(c);
      if (v < 0) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push_back((uint8_t)((acc >> bits) & 0xFF));
      }
    }
    return out;
  }

  // ---- context / helpers ----

  struct Ctx {
    std::vector<std::string> errors;
    bool lenient = false;
  };

  val makeModel() { return val::object(); }
  val makeArray() { return val::array(); }
  // int32 numbers cross the bridge as JS numbers; int64 as BigInt (WASM_BIGINT).
  void setNum(val &o, const char *k, int32_t v) { o.set(k, val(v)); }
  void setBig(val &o, const char *k, int64_t v) { o.set(k, val(v)); }
  void setStr(val &o, const char *k, const std::string &v) { o.set(k, val(v)); }

  val errorsArray(const std::vector<std::string> &errors) {
    val arr = makeArray();
    for (auto &e : errors) arr.call<void>("push", val(e));
    return arr;
  }

  // ---- reading ----

  bool readString(ByteReader &r, std::string &out, Ctx &ctx) {
    uint16_t len;
    if (!getU16(r, len)) { ctx.errors.push_back("truncated string length"); return false; }
    if (r.pos + len > r.size) { ctx.errors.push_back("truncated string data"); return false; }
    out = fromModifiedUTF8(r.data + r.pos, len);
    r.pos += len;
    return true;
  }

  val readTagAt(ByteReader &r, uint8_t type, const std::string &name, Ctx &ctx);

  val readCompound(ByteReader &r, Ctx &ctx) {
    val pairs = makeArray();
    while (r.remaining() > 0) {
      uint8_t t;
      if (!r.takeByte(t)) { ctx.errors.push_back("unexpected end of compound"); break; }
      if (t == T_End) break;
      if (t > T_LongArray) {
        ctx.errors.push_back("unknown tag type " + std::to_string((int)t) + "; compound halted");
        break;
      }
      std::string name;
      if (!readString(r, name, ctx)) break;
      val pair = makeArray();
      pair.set(0, val(name));
      pair.set(1, readTagAt(r, t, name, ctx));
      pairs.call<void>("push", pair);
    }
    return pairs;
  }

  val readTagAt(ByteReader &r, uint8_t type, const std::string &name, Ctx &ctx) {
    val m = makeModel();
    setNum(m, "t", type);
    setStr(m, "n", name);

    switch (type) {
      case T_Byte: {
        uint8_t b;
        if (!r.takeByte(b)) { ctx.errors.push_back("truncated byte"); break; }
        setNum(m, "v", (int8_t)b);
        break;
      }
      case T_Short: {
        uint16_t v;
        if (!getU16(r, v)) { ctx.errors.push_back("truncated short"); break; }
        setNum(m, "v", (int16_t)v);
        break;
      }
      case T_Int: {
        uint32_t v;
        if (!getU32(r, v)) { ctx.errors.push_back("truncated int"); break; }
        setNum(m, "v", (int32_t)v);
        break;
      }
      case T_Long: {
        uint64_t v;
        if (!getU64(r, v)) { ctx.errors.push_back("truncated long"); break; }
        setBig(m, "v", (int64_t)v);
        break;
      }
      case T_Float: {
        uint32_t bits;
        if (!getU32(r, bits)) { ctx.errors.push_back("truncated float"); break; }
        float f;
        memcpy(&f, &bits, 4);
        m.set("v", val((double)f));
        break;
      }
      case T_Double: {
        uint64_t bits;
        if (!getU64(r, bits)) { ctx.errors.push_back("truncated double"); break; }
        double d;
        memcpy(&d, &bits, 8);
        m.set("v", val(d));
        break;
      }
      case T_String: {
        std::string s;
        if (!readString(r, s, ctx)) break;
        setStr(m, "v", s);
        break;
      }
      case T_ByteArray: {
        uint32_t count;
        if (!getU32(r, count)) { ctx.errors.push_back("truncated byte array length"); break; }
        if (r.pos + count > r.size) { ctx.errors.push_back("truncated byte array data"); break; }
        setStr(m, "v", toBase64(r.data + r.pos, count));
        r.pos += count;
        break;
      }
      case T_IntArray: {
        uint32_t count;
        if (!getU32(r, count)) { ctx.errors.push_back("truncated int array length"); break; }
        val elems = makeArray();
        for (uint32_t i = 0; i < count; ++i) {
          uint32_t v;
          if (!getU32(r, v)) { ctx.errors.push_back("truncated int array data"); break; }
          elems.call<void>("push", val((int32_t)v));
        }
        m.set("v", elems);
        break;
      }
      case T_LongArray: {
        uint32_t count;
        if (!getU32(r, count)) { ctx.errors.push_back("truncated long array length"); break; }
        val elems = makeArray();
        for (uint32_t i = 0; i < count; ++i) {
          uint64_t v;
          if (!getU64(r, v)) { ctx.errors.push_back("truncated long array data"); break; }
          elems.call<void>("push", val((int64_t)v));
        }
        m.set("v", elems);
        break;
      }
      case T_List: {
        uint8_t et;
        if (!r.takeByte(et)) { ctx.errors.push_back("truncated list header"); break; }
        uint32_t count;
        if (!getU32(r, count)) { ctx.errors.push_back("truncated list count"); break; }
        setNum(m, "et", et);
        val elems = makeArray();
        for (uint32_t i = 0; i < count && r.remaining() > 0; ++i) {
          if (et > T_LongArray) { ctx.errors.push_back("unknown list entry type"); break; }
          elems.call<void>("push", readTagAt(r, et, "", ctx));
        }
        m.set("v", elems);
        break;
      }
      case T_Compound:
        m.set("v", readCompound(r, ctx));
        break;
      default:
        ctx.errors.push_back("unsupported tag type " + std::to_string((int)type));
        break;
    }
    return m;
  }

  // ---- writing ----

  void writeString(ByteWriter &w, const std::string &mUTF8) {
    putU16(w, (uint16_t)mUTF8.size());
    w.put(mUTF8.data(), mUTF8.size());
  }

  void encodeTag(const val &m, ByteWriter &w, bool withName) {
    int t = m["t"].as<int>();
    if (withName) {
      std::string nm = m["n"].as<std::string>();
      writeString(w, toModifiedUTF8(nm));
    }

    switch (t) {
      case T_Byte: w.putByte((uint8_t)(int8_t)m["v"].as<int>()); break;
      case T_Short: putU16(w, (uint16_t)(int16_t)m["v"].as<int>()); break;
      case T_Int: putU32(w, (uint32_t)(int32_t)m["v"].as<int>()); break;
      case T_Long: putU64(w, (uint64_t)m["v"].as<int64_t>()); break;
      case T_Float: {
        float f = m["v"].as<float>();
        uint32_t bits;
        memcpy(&bits, &f, 4);
        putU32(w, bits);
        break;
      }
      case T_Double: {
        double d = m["v"].as<double>();
        uint64_t bits;
        memcpy(&bits, &d, 8);
        putU64(w, bits);
        break;
      }
      case T_String: writeString(w, toModifiedUTF8(m["v"].as<std::string>())); break;
      case T_ByteArray: {
        std::string b64 = m["v"].as<std::string>();
        std::vector<uint8_t> bytes = fromBase64(b64);
        putU32(w, (uint32_t)bytes.size());
        w.put(bytes.data(), bytes.size());
        break;
      }
      case T_IntArray: {
        val elems = m["v"];
        uint32_t n = elems["length"].as<uint32_t>();
        putU32(w, n);
        for (uint32_t i = 0; i < n; ++i) putU32(w, (uint32_t)(int32_t)elems[i].as<int>());
        break;
      }
      case T_LongArray: {
        val elems = m["v"];
        uint32_t n = elems["length"].as<uint32_t>();
        putU32(w, n);
        for (uint32_t i = 0; i < n; ++i) putU64(w, (uint64_t)elems[i].as<int64_t>());
        break;
      }
      case T_List: {
        int et = m["et"].as<int>();
        w.putByte((uint8_t)et);
        val elems = m["v"];
        uint32_t n = elems["length"].as<uint32_t>();
        putU32(w, n);
        for (uint32_t i = 0; i < n; ++i) encodeTag(elems[i], w, false);
        break;
      }
      case T_Compound: {
        val pairs = m["v"];
        uint32_t n = pairs["length"].as<uint32_t>();
        for (uint32_t i = 0; i < n; ++i) {
          val pair = pairs[i];
          w.putByte((uint8_t)pair[1]["t"].as<int>());
          writeString(w, toModifiedUTF8(pair[0].as<std::string>()));
          encodeTag(pair[1], w, false);
        }
        w.putByte((uint8_t)T_End);
        break;
      }
      default:
        throw std::string("encode: unsupported tag type ") + std::to_string(t);
    }
  }

} // namespace

// ---------------------------------------------------------------------------

val decodeModel(const std::string &base64Input, bool lenient) {
  std::vector<uint8_t> bytes = fromBase64(base64Input);
  ByteReader r(bytes.data(), bytes.size());
  Ctx ctx;
  ctx.lenient = lenient;

  uint8_t rootType;
  if (!r.takeByte(rootType)) {
    ctx.errors.push_back("empty or unreadable input");
    val out = val::object();
    out.set("ok", val(false));
    out.set("root", val::null());
    out.set("errors", errorsArray(ctx.errors));
    return out;
  }

  std::string rootName;
  if (!readString(r, rootName, ctx)) {
    ctx.errors.push_back("failed reading root name");
  }

  val root = readTagAt(r, rootType, rootName, ctx);

  val out = val::object();
  out.set("ok", val(true));
  out.set("root", root);
  out.set("errors", errorsArray(ctx.errors));
  return out;
}

std::string encodeModel(const val &model) {
  ByteWriter w;
  int t = model["t"].as<int>();
  w.putByte((uint8_t)t);
  encodeTag(model, w, true);
  return toBase64((const uint8_t *)w.out.data(), w.out.size());
}

} // namespace nbt