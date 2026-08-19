//
//  main.cpp
//  webNBT next
//
//  Emscripten bindings.
//

#include "nbt_utils.h"

#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(webnbt) {
  function("decode", &nbt::decodeModel);
  function("encode", &nbt::encodeModel);
}