NBT_CPP=$(wildcard nbt-utils/*.cpp)

build:
	em++ -O3 -s WASM_BIGINT=1 -s SINGLE_FILE=1 -s MODULARIZE=1 -s EXPORT_NAME=createNBTModule -s ALLOW_MEMORY_GROWTH=1 -s DISABLE_EXCEPTION_CATCHING=0 --bind -std=c++17 $(NBT_CPP) -o web-app/NBT.js

clean:
	rm -f nbt-utils/*.o nbt-utils/*.bc

.PHONY: build clean