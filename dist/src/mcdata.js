/* ─────────────────────────────────────────────────────────────────────────────
 * mcdata.js — Minecraft data hints + smart structure recognition.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';
  const { T, isCompound, isList } = ns;

  // Legacy (pre-1.13) numeric block ids 0..95.
  const BLOCKS = [
    'air', 'stone', 'grass', 'dirt', 'cobblestone', 'oak_planks', 'sapling', 'bedrock',
    'flowing_water', 'water', 'flowing_lava', 'lava', 'sand', 'gravel', 'gold_ore', 'iron_ore',
    'coal_ore', 'oak_log', 'oak_leaves', 'sponge', 'glass', 'lapis_ore', 'lapis_block', 'dispenser',
    'sandstone', 'note_block', 'bed', 'golden_rail', 'detector_rail', 'sticky_piston', 'web', 'tallgrass',
    'deadbush', 'piston', 'piston_head', 'wool', 'piston_extension', 'yellow_flower', 'red_flower', 'brown_mushroom',
    'red_mushroom', 'gold_block', 'iron_block', 'double_stone_slab', 'stone_slab', 'brick_block', 'tnt', 'bookshelf',
    'mossy_cobblestone', 'obsidian', 'torch', 'fire', 'mob_spawner', 'oak_stairs', 'chest', 'redstone_wire',
    'diamond_ore', 'diamond_block', 'crafting_table', 'wheat', 'farmland', 'furnace', 'lit_furnace', 'standing_sign',
    'wooden_door', 'ladder', 'rail', 'stone_stairs', 'wall_sign', 'lever', 'stone_pressure_plate', 'iron_door',
    'wooden_pressure_plate', 'redstone_ore', 'lit_redstone_ore', 'redstone_torch', 'lit_redstone_torch', 'stone_button', 'snow_layer', 'ice',
    'snow', 'cactus', 'clay', 'reeds', 'jukebox', 'fence', 'pumpkin', 'netherrack',
    'soul_sand', 'glowstone', 'portal', 'lit_pumpkin', 'cake', 'unpowered_repeater', 'powered_repeater', 'stained_glass',
  ];

  function blockName(legacyId, damage) {
    const base = BLOCKS[legacyId];
    if (!base) return 'block:' + legacyId;
    if (damage && (legacyId === 5 || legacyId === 17 || legacyId === 35)) return base + ':meta' + damage;
    return base;
  }

  function itemName(idStr) {
    if (typeof idStr !== 'string') return String(idStr);
    const short = idStr.indexOf(':') >= 0 ? idStr.split(':').slice(1).join(':') : idStr;
    return short.replace(/_/g, ' ');
  }

  // ── tag access helpers ──────────────────────────────────────────────────────

  function get(tag, key) {
    if (!isCompound(tag)) return undefined;
    const hit = tag.v.find(([k]) => k === key);
    return hit ? hit[1] : undefined;
  }

  function getVal(tag, key) { const c = get(tag, key); return c ? c.v : undefined; }

  function asInt(v) { return typeof v === 'bigint' ? Number(v) : Number(v); }

  // ── recognizers ─────────────────────────────────────────────────────────────

  function looksLikeItemStack(tag) {
    if (!isCompound(tag)) return false;
    const keys = tag.v.map(([k]) => k);
    return (keys.includes('id') && keys.includes('Count')) ||
      (keys.includes('id') && keys.includes('Damage'));
  }

  function looksLikeBlockEntity(tag) {
    if (!isCompound(tag)) return false;
    const keys = tag.v.map(([k]) => k);
    const id = getVal(tag, 'id');
    return typeof id === 'string' && keys.includes('x') && keys.includes('y') && keys.includes('z');
  }

  function looksLikeInventoryTag(tag) {
    if (!isList(tag) || tag.v.length === 0) return false;
    return tag.v.every(looksLikeItemStack);
  }

  // ── item stack card ─────────────────────────────────────────────────────────

  function itemStackInfo(tag) {
    const id = getVal(tag, 'id');
    let displayName = itemName(id);
    let icon = 'item';
    if (typeof id === 'string' && id.indexOf(':') > 0) {
      const ns2 = id.split(':'); if (ns2[0] === 'minecraft') icon = 'minecraft-item';
    }
    const count = getVal(tag, 'Count');
    const damage = getVal(tag, 'Damage');
    const slots = getVal(tag, 'Slot');
    const customName = (() => {
      const inner = get(getVal(tag, 'tag'), 'display');
      return inner ? getVal(inner, 'Name') : undefined;
    })();
    return {
      icon,
      id: String(id),
      displayName: customName || displayName,
      count,
      damage,
      slot: slots !== undefined ? asInt(slots) : null,
    };
  }

  // ── smart card builder ──────────────────────────────────────────────────────

  // Returns a render descriptor or null. chain = path keys/indices from root.
  function smartFor(tag, chain) {
    const lastKey = chain.length ? chain[chain.length - 1] : null;

    if (looksLikeBlockEntity(tag)) {
      const kv = {
        'id': getVal(tag, 'id'),
        'x': getVal(tag, 'x'), 'y': getVal(tag, 'y'), 'z': getVal(tag, 'z'),
        'CustomName': getVal(tag, 'CustomName'),
      };
      const items = get(tag, 'Items');
      const inventory = isList(items) ? items.v.map(itemStackInfo) : [];
      return { kind: 'blockEntity', title: 'Block entity', kv, inventory, tag };
    }

    if (looksLikeItemStack(tag)) {
      return { kind: 'itemStack', title: 'Item stack', item: itemStackInfo(tag), tag };
    }

    if (looksLikeInventoryTag(tag) && (lastKey === 'Items' || lastKey === 'Inventory')) {
      return { kind: 'inventory', title: 'Inventory (' + tag.v.length + ')', items: tag.v.map(itemStackInfo), tag };
    }

    // Structure save/load "Data" compound
    if (lastKey === 'Data' && isCompound(tag) && get(tag, 'size')) {
      const size = getVal(tag, 'size');
      const palette = get(tag, 'palette');
      const blocks = get(tag, 'blocks');
      const entities = get(tag, 'entities');
      return {
        kind: 'structureData', title: 'Structure data',
        kv: {
          size: Array.isArray(size) ? size.join(' × ') : String(size),
          palette: isList(palette) ? palette.v.length : 0,
          blocks: isList(blocks) ? blocks.v.length : 0,
          entities: isList(entities) ? entities.v.length : 0,
          author: getVal(tag, 'author'),
        },
        tag,
      };
    }

    return null;
  }

  ns.mcdata = { blockName, itemName, smartFor, itemStackInfo, looksLikeBlockEntity };

  return ns;
})(window.NBT || {});