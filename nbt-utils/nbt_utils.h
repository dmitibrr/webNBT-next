//
//  nbt_utils.h
//  webNBT next
//
//  Pure NBT codec: bytes <-> JS model.
//  The JS side owns the editing model; this layer only decodes/encodes.
//

#ifndef __nbt_utils__nbt_utils__
#define __nbt_utils__nbt_utils__

#include <stdint.h>
#include <string>

#include <emscripten/val.h>

namespace nbt {

  // Tag type ids (Java edition, big-endian).
  enum Type : int8_t {
    T_End     = 0,
    T_Byte    = 1,
    T_Short   = 2,
    T_Int     = 3,
    T_Long    = 4,
    T_Float   = 5,
    T_Double  = 6,
    T_ByteArray = 7,
    T_String  = 8,
    T_List    = 9,
    T_Compound = 10,
    T_IntArray = 11,
    T_LongArray = 12
  };

  // Decode a raw (uncompressed) NBT byte blob (given as a base64 string) into
  // a JS result object:   { ok: bool, root: model|null, errors: string[] }
  // The model is a tree of { t, n, v, et? } objects:
  //   Compound  -> v: [[key, child], ...]        (order preserved)
  //   List      -> et: entry type, v: [child, ...]
  //   ByteArray -> v: base64 string
  //   IntArray  -> v: number[]
  //   LongArray -> v: bigint[]
  //   Long      -> v: bigint
  //   others    -> v: string | number
  // Lenient mode keeps going and collects errors instead of aborting.
  emscripten::val decodeModel(const std::string &base64Input, bool lenient);

  // Encode a JS model back into NBT bytes, returned as a base64 string.
  // Throws std::string on a malformed model.
  std::string encodeModel(const emscripten::val &model);

} // namespace nbt

#endif /* defined(__nbt_utils__nbt_utils__) */