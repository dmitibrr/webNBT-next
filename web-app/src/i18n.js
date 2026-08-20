/* ─────────────────────────────────────────────────────────────────────────────
 * i18n.js — lightweight UI localization (en / es / ru / zh / ja).
 * Exposes ns.t(key, ...args) for plain strings and ns.tpl(key, n, ...args)
 * for plural-aware counts. Static HTML uses data-i18n* attributes applied
 * on DOMContentLoaded and on language switch.
 * ───────────────────────────────────────────────────────────────────────────── */

window.NBT = (function (ns) {
  'use strict';

  const LOCALES = ['en', 'es', 'ru', 'zh', 'ja'];
  const LOCALE_NAMES = { en: 'English', es: 'Español', ru: 'Русский', zh: '中文', ja: '日本語' };

  const dict = {
    en: {
      'app.title': 'webNBT · NBT editor',
      'drop.title': 'Drop a file here',
      'drop.sub': '.dat · .schematic · .mcmeta · .mca/.mcr (region) · any NBT (gzip, zlib, raw deflate or uncompressed)',
      'loading.booting': 'Booting NBT codec…',
      'loading.ready': 'Ready',
      'btn.open': 'Open',
      'btn.open.title': 'Open file (Ctrl+O)',
      'btn.save': 'Save',
      'btn.save.title': 'Save file (Ctrl+S)',
      'btn.formats': '⇅ Formats',
      'btn.formats.title': 'Import / export as SNBT or JSON',
      'btn.undo.title': 'Undo (Ctrl+Z)',
      'btn.redo.title': 'Redo (Ctrl+Y)',
      'btn.add.title': 'Add tag',
      'btn.duplicate.title': 'Duplicate',
      'btn.delete.title': 'Delete tag (Del)',
      'btn.hex': '# Hex',
      'btn.hex.title': 'Toggle hex view',
      'btn.smart': '✲ Smart',
      'btn.smart.title': 'Smart views for structures/inventories',
      'btn.theme.title': 'Toggle theme',
      'search.placeholder': 'Search tags… (Enter next)',
      'empty.big': 'No file loaded',
      'empty.sub': 'Click <b>Open</b>, drop a file anywhere, or <button id="empty-open">browse…</button>',
      'panel.empty': 'Select a tag to inspect &amp; edit it.',
      'menu.rename': 'Rename…',
      'menu.duplicate': 'Duplicate',
      'menu.copy': 'Copy',
      'menu.pasteAfter': 'Paste after',
      'menu.new': '▾ New',
      'menu.sortKeys': 'Sort keys',
      'menu.addElement': 'Add element',
      'menu.elementType': '▾ Element type',
      'menu.delete': 'Delete',
      'menu.changeType': '▾ Change type',
      'toast.cannotMove': 'Cannot move {0} into List<{1}>',
      'toast.copied': 'Copied {0}',
      'err.parse': 'Could not parse file as NBT',
      'warn.parseIssues': 'Parse had issues ({0}) — lenient mode',
      'warn.chunkIssues': ['Save warning: {0} issue', 'Save warning: {0} issues'],
      'toast.savedRegion': 'Saved region file',
      'toast.stagedChunk': 'Staged chunk r.{0}.{1} — save the region file to write',
      'toast.saved': 'Saved {0}',
      'region.title': ['Region file — {0} chunk', 'Region file — {0} chunks'],
      'region.empty': 'No chunks in this region.',
      'region.saveBtn': 'Save region file',
      'err.chunkUnreadable': 'Chunk unreadable',
      'status.region': ['region · {0} chunk', 'region · {0} chunks'],
      'status.chunk': 'chunk {0}.{1}',
      'status.tags': ['{0} tag', '{0} tags'],
      'status.hist': 'hist {0}',
      'formats.exportSNBT': 'Export as SNBT',
      'formats.exportJSON': 'Export as JSON',
      'formats.import': 'Import SNBT / JSON file…',
      'formats.exportBase64': 'Export raw NBT as base64',
      'formats.copyPython': 'Copy as Python (nbtlib)',
      'formats.exportB64SNBT': 'Copy SNBT as base64',
      'formats.recent': '▾ Recent files',
      'formats.compare': 'Compare with another NBT file…',
      'compare.title': 'Diff vs {0}',
      'compare.changes': ['{0} difference', '{0} differences'],
      'compare.identical': 'Files are identical',
      'compare.close': 'Close diff',
      'toast.importedSNBT': 'Imported from SNBT',
      'toast.importedJSON': 'Imported from JSON',
      'err.importFailed': 'Import failed: {0}',
      'insp.rename': '✎ rename',
      'insp.newTag': '＋ New tag',
      'insp.duplicate': 'Duplicate',
      'insp.delete': 'Delete',
      'insp.changeType': 'Change type…',
      'insp.exportSNBT': 'Export SNBT',
      'insp.root': '(root)',
      'field.value': 'value',
      'field.string': 'string',
      'field.replaceBytes': 'replace bytes (hex or decimal, any separators)',
      'str.length': 'length: {0} chars · {1} bytes',
      'str.prettyJson': 'looks like JSON — pretty',
      'array.intTitle': 'int[] — {0}',
      'array.longTitle': 'long[] — {0}',
      'array.byteTitle': 'byte[] — {0} bytes',
      'array.addRow': '＋ add row',
      'list.title': 'List<{0}> — {1}',
      'list.entryType': 'entry type',
      'list.add': '＋ add {0}',
      'compound.title': ['Compound — {0} entry', 'Compound — {0} entries'],
      'compound.add': '＋ add tag',
      'chip.unsigned': 'unsigned',
      'chip.hex': 'hex',
      'chip.char': 'char',
      'chip.exact': 'exact',
      'chip.false': 'false',
      'chip.true': 'true',
      'hex.empty': '(empty)',
      'smart.items': 'Items',
      'smart.inventory': 'Inventory',
      'smart.blockEntity': 'Block entity',
      'smart.itemStack': 'Item stack',
      'smart.inventoryCount': 'Inventory ({0})',
      'smart.structure': 'Structure data',
      'tree.unnamed': '(unnamed)',
      'tree.empty': 'empty',
      'tree.badge.tags': ['{0} tag', '{0} tags'],
      'tree.badge.items': ['{0} item', '{0} items'],
      'lang.label': 'Language',
      'btn.types.title': 'Toggle localized type names',
      'type.0': 'End', 'type.1': 'Byte', 'type.2': 'Short', 'type.3': 'Int', 'type.4': 'Long',
      'type.5': 'Float', 'type.6': 'Double', 'type.7': 'ByteArray', 'type.8': 'String',
      'type.9': 'List', 'type.10': 'Compound', 'type.11': 'IntArray', 'type.12': 'LongArray',
    },
    es: {
      'app.title': 'webNBT · editor de NBT',
      'drop.title': 'Suelta un archivo aquí',
      'drop.sub': '.dat · .schematic · .mcmeta · .mca/.mcr (región) · cualquier NBT (gzip, zlib, deflate sin cabecera o sin comprimir)',
      'loading.booting': 'Iniciando codec NBT…',
      'loading.ready': 'Listo',
      'btn.open': 'Abrir',
      'btn.open.title': 'Abrir archivo (Ctrl+O)',
      'btn.save': 'Guardar',
      'btn.save.title': 'Guardar archivo (Ctrl+S)',
      'btn.formats': '⇅ Formatos',
      'btn.formats.title': 'Importar / exportar como SNBT o JSON',
      'btn.undo.title': 'Deshacer (Ctrl+Z)',
      'btn.redo.title': 'Rehacer (Ctrl+Y)',
      'btn.add.title': 'Añadir etiqueta',
      'btn.duplicate.title': 'Duplicar',
      'btn.delete.title': 'Eliminar etiqueta (Supr)',
      'btn.hex': '# Hex',
      'btn.hex.title': 'Alternar vista hexadecimal',
      'btn.smart': '✲ Inteligente',
      'btn.smart.title': 'Vistas inteligentes para estructuras/inventarios',
      'btn.theme.title': 'Cambiar tema',
      'search.placeholder': 'Buscar etiquetas… (Intro siguiente)',
      'empty.big': 'Sin archivo cargado',
      'empty.sub': 'Haz clic en <b>Abrir</b>, suelta un archivo en cualquier lugar o <button id="empty-open">explorar…</button>',
      'panel.empty': 'Selecciona una etiqueta para inspeccionarla y editarla.',
      'menu.rename': 'Renombrar…',
      'menu.duplicate': 'Duplicar',
      'menu.copy': 'Copiar',
      'menu.pasteAfter': 'Pegar después',
      'menu.new': '▾ Nuevo',
      'menu.sortKeys': 'Ordenar claves',
      'menu.addElement': 'Añadir elemento',
      'menu.elementType': '▾ Tipo de elemento',
      'menu.delete': 'Eliminar',
      'menu.changeType': '▾ Cambiar tipo',
      'toast.cannotMove': 'No se puede mover {0} a List<{1}>',
      'toast.copied': 'Copiado {0}',
      'err.parse': 'No se pudo analizar el archivo como NBT',
      'warn.parseIssues': 'El análisis tuvo problemas ({0}) — modo tolerante',
      'warn.chunkIssues': ['Advertencia al guardar: {0} problema', 'Advertencia al guardar: {0} problemas'],
      'toast.savedRegion': 'Archivo de región guardado',
      'toast.stagedChunk': 'Chunk r.{0}.{1} preparado — guarda el archivo de región para escribir',
      'toast.saved': 'Guardado {0}',
      'region.title': ['Archivo de región — {0} chunk', 'Archivo de región — {0} chunks'],
      'region.empty': 'No hay chunks en esta región.',
      'region.saveBtn': 'Guardar archivo de región',
      'err.chunkUnreadable': 'Chunk ilegible',
      'status.region': ['región · {0} chunk', 'región · {0} chunks'],
      'status.chunk': 'chunk {0}.{1}',
      'status.tags': ['{0} etiqueta', '{0} etiquetas'],
      'status.hist': 'hist {0}',
      'formats.exportSNBT': 'Exportar como SNBT',
      'formats.exportJSON': 'Exportar como JSON',
      'formats.import': 'Importar archivo SNBT / JSON…',
      'formats.exportBase64': 'Exportar NBT sin comprimir como base64',
      'formats.copyPython': 'Copiar como Python (nbtlib)',
      'formats.exportB64SNBT': 'Copiar SNBT como base64',
      'formats.recent': '▾ Archivos recientes',
      'formats.compare': 'Comparar con otro archivo NBT…',
      'compare.title': 'Diferencias vs {0}',
      'compare.changes': ['{0} diferencia', '{0} diferencias'],
      'compare.identical': 'Los archivos son idénticos',
      'compare.close': 'Cerrar diff',
      'toast.importedSNBT': 'Importado desde SNBT',
      'toast.importedJSON': 'Importado desde JSON',
      'err.importFailed': 'Error de importación: {0}',
      'insp.rename': '✎ renombrar',
      'insp.newTag': '＋ Nueva etiqueta',
      'insp.duplicate': 'Duplicar',
      'insp.delete': 'Eliminar',
      'insp.changeType': 'Cambiar tipo…',
      'insp.exportSNBT': 'Exportar SNBT',
      'insp.root': '(raíz)',
      'field.value': 'valor',
      'field.string': 'texto',
      'field.replaceBytes': 'reemplazar bytes (hex o decimal, cualquier separador)',
      'str.length': 'longitud: {0} caracteres · {1} bytes',
      'str.prettyJson': 'parece JSON — formatear',
      'array.intTitle': 'int[] — {0}',
      'array.longTitle': 'long[] — {0}',
      'array.byteTitle': 'byte[] — {0} bytes',
      'array.addRow': '＋ añadir fila',
      'list.title': 'Lista<{0}> — {1}',
      'list.entryType': 'tipo de entrada',
      'list.add': '＋ añadir {0}',
      'compound.title': ['Compound — {0} entrada', 'Compound — {0} entradas'],
      'compound.add': '＋ añadir etiqueta',
      'chip.unsigned': 'sin signo',
      'chip.hex': 'hex',
      'chip.char': 'carácter',
      'chip.exact': 'exacto',
      'chip.false': 'falso',
      'chip.true': 'verdadero',
      'hex.empty': '(vacío)',
      'smart.items': 'Objetos',
      'smart.inventory': 'Inventario',
      'smart.blockEntity': 'Entidad de bloque',
      'smart.itemStack': 'Objeto apilado',
      'smart.inventoryCount': 'Inventario ({0})',
      'smart.structure': 'Datos de estructura',
      'tree.unnamed': '(sin nombre)',
      'tree.empty': 'vacío',
      'tree.badge.tags': ['{0} etiqueta', '{0} etiquetas'],
      'tree.badge.items': ['{0} objeto', '{0} objetos'],
      'lang.label': 'Idioma',
      'btn.types.title': 'Alternar nombres de tipo localizados',
      'type.0': 'End', 'type.1': 'Byte', 'type.2': 'Short', 'type.3': 'Entero', 'type.4': 'Long',
      'type.5': 'Flotante', 'type.6': 'Doble', 'type.7': 'Matriz de bytes', 'type.8': 'Texto',
      'type.9': 'Lista', 'type.10': 'Compuesto', 'type.11': 'Matriz de enteros', 'type.12': 'Matriz de longs',
    },
    ru: {
      'app.title': 'webNBT · редактор NBT',
      'drop.title': 'Перетащите файл сюда',
      'drop.sub': '.dat · .schematic · .mcmeta · .mca/.mcr (регион) · любой NBT (gzip, zlib, raw deflate или без сжатия)',
      'loading.booting': 'Загрузка NBT-кодека…',
      'loading.ready': 'Готово',
      'btn.open': 'Открыть',
      'btn.open.title': 'Открыть файл (Ctrl+O)',
      'btn.save': 'Сохранить',
      'btn.save.title': 'Сохранить файл (Ctrl+S)',
      'btn.formats': '⇅ Форматы',
      'btn.formats.title': 'Импорт / экспорт в SNBT или JSON',
      'btn.undo.title': 'Отменить (Ctrl+Z)',
      'btn.redo.title': 'Повторить (Ctrl+Y)',
      'btn.add.title': 'Добавить тег',
      'btn.duplicate.title': 'Дублировать',
      'btn.delete.title': 'Удалить тег (Del)',
      'btn.hex': '# Hex',
      'btn.hex.title': 'Показать/скрыть hex-вид',
      'btn.smart': '✲ Умный',
      'btn.smart.title': 'Умные виды для структур/инвентарей',
      'btn.theme.title': 'Сменить тему',
      'search.placeholder': 'Поиск тегов… (Enter — далее)',
      'empty.big': 'Файл не загружен',
      'empty.sub': 'Нажмите <b>Открыть</b>, перетащите файл в любое место или <button id="empty-open">обзор…</button>',
      'panel.empty': 'Выберите тег для просмотра и редактирования.',
      'menu.rename': 'Переименовать…',
      'menu.duplicate': 'Дублировать',
      'menu.copy': 'Копировать',
      'menu.pasteAfter': 'Вставить после',
      'menu.new': '▾ Новый',
      'menu.sortKeys': 'Сортировать ключи',
      'menu.addElement': 'Добавить элемент',
      'menu.elementType': '▾ Тип элемента',
      'menu.delete': 'Удалить',
      'menu.changeType': '▾ Сменить тип',
      'toast.cannotMove': 'Нельзя переместить {0} в List<{1}>',
      'toast.copied': 'Скопировано: {0}',
      'err.parse': 'Не удалось разобрать файл как NBT',
      'warn.parseIssues': 'При разборе были проблемы ({0}) — щадящий режим',
      'warn.chunkIssues': ['Предупреждение при сохранении: {0} проблема', 'Предупреждение при сохранении: {0} проблемы', 'Предупреждение при сохранении: {0} проблем'],
      'toast.savedRegion': 'Файл региона сохранён',
      'toast.stagedChunk': 'Чанк r.{0}.{1} готов — сохраните файл региона, чтобы записать',
      'toast.saved': 'Сохранено: {0}',
      'region.title': ['Файл региона — {0} чанк', 'Файл региона — {0} чанка', 'Файл региона — {0} чанков'],
      'region.empty': 'В этом регионе нет чанков.',
      'region.saveBtn': 'Сохранить файл региона',
      'err.chunkUnreadable': 'Чанк не читается',
      'status.region': ['регион · {0} чанк', 'регион · {0} чанка', 'регион · {0} чанков'],
      'status.chunk': 'чанк {0}.{1}',
      'status.tags': ['{0} тег', '{0} тега', '{0} тегов'],
      'status.hist': 'ист. {0}',
      'formats.exportSNBT': 'Экспорт в SNBT',
      'formats.exportJSON': 'Экспорт в JSON',
      'formats.import': 'Импорт файла SNBT / JSON…',
      'formats.exportBase64': 'Экспорт сырого NBT в base64',
      'formats.copyPython': 'Копировать как Python (nbtlib)',
      'formats.exportB64SNBT': 'Копировать SNBT в base64',
      'formats.recent': '▾ Недавние файлы',
      'formats.compare': 'Сравнить с другим NBT-файлом…',
      'compare.title': 'Различия с {0}',
      'compare.changes': ['{0} различие', '{0} различия', '{0} различий'],
      'compare.identical': 'Файлы идентичны',
      'compare.close': 'Закрыть diff',
      'toast.importedSNBT': 'Импортировано из SNBT',
      'toast.importedJSON': 'Импортировано из JSON',
      'err.importFailed': 'Ошибка импорта: {0}',
      'insp.rename': '✎ переименовать',
      'insp.newTag': '＋ Новый тег',
      'insp.duplicate': 'Дублировать',
      'insp.delete': 'Удалить',
      'insp.changeType': 'Сменить тип…',
      'insp.exportSNBT': 'Экспорт SNBT',
      'insp.root': '(корень)',
      'field.value': 'значение',
      'field.string': 'строка',
      'field.replaceBytes': 'заменить байты (hex или десятичные, любые разделители)',
      'str.length': 'длина: {0} симв. · {1} байт',
      'str.prettyJson': 'похоже на JSON — форматировать',
      'array.intTitle': 'int[] — {0}',
      'array.longTitle': 'long[] — {0}',
      'array.byteTitle': 'byte[] — {0} байт',
      'array.addRow': '＋ добавить строку',
      'list.title': 'List<{0}> — {1}',
      'list.entryType': 'тип элемента',
      'list.add': '＋ добавить {0}',
      'compound.title': ['Compound — {0} запись', 'Compound — {0} записи', 'Compound — {0} записей'],
      'compound.add': '＋ добавить тег',
      'chip.unsigned': 'без знака',
      'chip.hex': 'hex',
      'chip.char': 'символ',
      'chip.exact': 'точно',
      'chip.false': 'ложь',
      'chip.true': 'истина',
      'hex.empty': '(пусто)',
      'smart.items': 'Предметы',
      'smart.inventory': 'Инвентарь',
      'smart.blockEntity': 'Блок-сущность',
      'smart.itemStack': 'Предмет',
      'smart.inventoryCount': 'Инвентарь ({0})',
      'smart.structure': 'Данные структуры',
      'tree.unnamed': '(без имени)',
      'tree.empty': 'пусто',
      'tree.badge.tags': ['{0} тег', '{0} тега', '{0} тегов'],
      'tree.badge.items': ['{0} предмет', '{0} предмета', '{0} предметов'],
      'lang.label': 'Язык',
      'btn.types.title': 'Локализованные названия типов',
      'type.0': 'End', 'type.1': 'Байт', 'type.2': 'Короткое', 'type.3': 'Целое', 'type.4': 'Длинное',
      'type.5': 'Плавающее', 'type.6': 'Двойное', 'type.7': 'Массив байт', 'type.8': 'Строка',
      'type.9': 'Список', 'type.10': 'Составной', 'type.11': 'Массив int', 'type.12': 'Массив long',
    },
    zh: {
      'app.title': 'webNBT · NBT 编辑器',
      'drop.title': '将文件拖放到此处',
      'drop.sub': '.dat · .schematic · .mcmeta · .mca/.mcr（区域）· 任意 NBT（gzip、zlib、raw deflate 或未压缩）',
      'loading.booting': '正在启动 NBT 编解码器…',
      'loading.ready': '就绪',
      'btn.open': '打开',
      'btn.open.title': '打开文件 (Ctrl+O)',
      'btn.save': '保存',
      'btn.save.title': '保存文件 (Ctrl+S)',
      'btn.formats': '⇅ 格式',
      'btn.formats.title': '导入 / 导出为 SNBT 或 JSON',
      'btn.undo.title': '撤销 (Ctrl+Z)',
      'btn.redo.title': '重做 (Ctrl+Y)',
      'btn.add.title': '添加标签',
      'btn.duplicate.title': '复制',
      'btn.delete.title': '删除标签 (Del)',
      'btn.hex': '# Hex',
      'btn.hex.title': '切换十六进制视图',
      'btn.smart': '✲ 智能',
      'btn.smart.title': '结构和物品栏的智能视图',
      'btn.theme.title': '切换主题',
      'search.placeholder': '搜索标签…（Enter 下一个）',
      'empty.big': '未加载文件',
      'empty.sub': '点击 <b>打开</b>，将文件拖放到任意位置，或<button id="empty-open">浏览…</button>',
      'panel.empty': '选择一个标签进行查看和编辑。',
      'menu.rename': '重命名…',
      'menu.duplicate': '复制',
      'menu.copy': '复制',
      'menu.pasteAfter': '粘贴到后面',
      'menu.new': '▾ 新建',
      'menu.sortKeys': '按键排序',
      'menu.addElement': '添加元素',
      'menu.elementType': '▾ 元素类型',
      'menu.delete': '删除',
      'menu.changeType': '▾ 更改类型',
      'toast.cannotMove': '无法将 {0} 移入 List<{1}>',
      'toast.copied': '已复制 {0}',
      'err.parse': '无法将文件解析为 NBT',
      'warn.parseIssues': '解析出现问题（{0}）— 宽松模式',
      'warn.chunkIssues': '保存警告：{0} 个问题',
      'toast.savedRegion': '已保存区域文件',
      'toast.stagedChunk': '区块 r.{0}.{1} 已暂存 — 保存区域文件以写入',
      'toast.saved': '已保存 {0}',
      'region.title': '区域文件 — {0} 个区块',
      'region.empty': '此区域中没有区块。',
      'region.saveBtn': '保存区域文件',
      'err.chunkUnreadable': '区块无法读取',
      'status.region': '区域 · {0} 个区块',
      'status.chunk': '区块 {0}.{1}',
      'status.tags': '{0} 个标签',
      'status.hist': '历史 {0}',
      'formats.exportSNBT': '导出为 SNBT',
      'formats.exportJSON': '导出为 JSON',
      'formats.import': '导入 SNBT / JSON 文件…',
      'formats.exportBase64': '将原始 NBT 导出为 base64',
      'formats.copyPython': '复制为 Python（nbtlib）',
      'formats.exportB64SNBT': '将 SNBT 复制为 base64',
      'formats.recent': '▾ 最近文件',
      'formats.compare': '与另一个 NBT 文件比较…',
      'compare.title': '与 {0} 的差异',
      'compare.changes': '{0} 处差异',
      'compare.identical': '文件相同',
      'compare.close': '关闭差异',
      'toast.importedSNBT': '已从 SNBT 导入',
      'toast.importedJSON': '已从 JSON 导入',
      'err.importFailed': '导入失败：{0}',
      'insp.rename': '✎ 重命名',
      'insp.newTag': '＋ 新建标签',
      'insp.duplicate': '复制',
      'insp.delete': '删除',
      'insp.changeType': '更改类型…',
      'insp.exportSNBT': '导出 SNBT',
      'insp.root': '（根）',
      'field.value': '值',
      'field.string': '字符串',
      'field.replaceBytes': '替换字节（十六进制或十进制，任意分隔符）',
      'str.length': '长度：{0} 字符 · {1} 字节',
      'str.prettyJson': '看起来像 JSON — 格式化',
      'array.intTitle': 'int[] — {0}',
      'array.longTitle': 'long[] — {0}',
      'array.byteTitle': 'byte[] — {0} 字节',
      'array.addRow': '＋ 添加行',
      'list.title': 'List<{0}> — {1}',
      'list.entryType': '元素类型',
      'list.add': '＋ 添加 {0}',
      'compound.title': 'Compound — {0} 个条目',
      'compound.add': '＋ 添加标签',
      'chip.unsigned': '无符号',
      'chip.hex': 'hex',
      'chip.char': '字符',
      'chip.exact': '精确',
      'chip.false': '假',
      'chip.true': '真',
      'hex.empty': '（空）',
      'smart.items': '物品',
      'smart.inventory': '物品栏',
      'smart.blockEntity': '方块实体',
      'smart.itemStack': '物品堆叠',
      'smart.inventoryCount': '物品栏（{0}）',
      'smart.structure': '结构数据',
      'tree.unnamed': '（未命名）',
      'tree.empty': '空',
      'tree.badge.tags': '{0} 个标签',
      'tree.badge.items': '{0} 个物品',
      'lang.label': '语言',
      'btn.types.title': '切换本地化类型名称',
      'type.0': 'End', 'type.1': '字节', 'type.2': '短整型', 'type.3': '整型', 'type.4': '长整型',
      'type.5': '单精度浮点', 'type.6': '双精度浮点', 'type.7': '字节数组', 'type.8': '字符串',
      'type.9': '列表', 'type.10': '复合', 'type.11': '整型数组', 'type.12': '长整型数组',
    },
    ja: {
      'app.title': 'webNBT · NBT エディタ',
      'drop.title': 'ここにファイルをドロップ',
      'drop.sub': '.dat · .schematic · .mcmeta · .mca/.mcr（リージョン）· 任意の NBT（gzip、zlib、raw deflate または無圧縮）',
      'loading.booting': 'NBT コーデックを起動中…',
      'loading.ready': '準備完了',
      'btn.open': '開く',
      'btn.open.title': 'ファイルを開く (Ctrl+O)',
      'btn.save': '保存',
      'btn.save.title': 'ファイルを保存 (Ctrl+S)',
      'btn.formats': '⇅ 形式',
      'btn.formats.title': 'SNBT または JSON でインポート / エクスポート',
      'btn.undo.title': '元に戻す (Ctrl+Z)',
      'btn.redo.title': 'やり直す (Ctrl+Y)',
      'btn.add.title': 'タグを追加',
      'btn.duplicate.title': '複製',
      'btn.delete.title': 'タグを削除 (Del)',
      'btn.hex': '# Hex',
      'btn.hex.title': '16進表示を切り替え',
      'btn.smart': '✲ スマート',
      'btn.smart.title': '構造物 / インベントリのスマート表示',
      'btn.theme.title': 'テーマを切り替え',
      'search.placeholder': 'タグを検索…（Enter で次へ）',
      'empty.big': 'ファイルが読み込まれていません',
      'empty.sub': '<b>開く</b> をクリック、どこかにファイルをドロップ、または<button id="empty-open">参照…</button>',
      'panel.empty': 'タグを選択して表示・編集します。',
      'menu.rename': '名前を変更…',
      'menu.duplicate': '複製',
      'menu.copy': 'コピー',
      'menu.pasteAfter': '後ろに貼り付け',
      'menu.new': '▾ 新規作成',
      'menu.sortKeys': 'キーを並べ替え',
      'menu.addElement': '要素を追加',
      'menu.elementType': '▾ 要素タイプ',
      'menu.delete': '削除',
      'menu.changeType': '▾ タイプを変更',
      'toast.cannotMove': '{0} を List<{1}> に移動できません',
      'toast.copied': 'コピーしました: {0}',
      'err.parse': 'ファイルを NBT として解析できませんでした',
      'warn.parseIssues': '解析に問題がありました（{0}）— 寛容モード',
      'warn.chunkIssues': '保存時の警告：{0} 件の問題',
      'toast.savedRegion': 'リージョンファイルを保存しました',
      'toast.stagedChunk': 'チャンク r.{0}.{1} をステージング — リージョンファイルを保存して書き込み',
      'toast.saved': '保存しました: {0}',
      'region.title': 'リージョンファイル — {0} チャンク',
      'region.empty': 'このリージョンにはチャンクがありません。',
      'region.saveBtn': 'リージョンファイルを保存',
      'err.chunkUnreadable': 'チャンクを読み取れません',
      'status.region': 'リージョン · {0} チャンク',
      'status.chunk': 'チャンク {0}.{1}',
      'status.tags': '{0} タグ',
      'status.hist': '履歴 {0}',
      'formats.exportSNBT': 'SNBT としてエクスポート',
      'formats.exportJSON': 'JSON としてエクスポート',
      'formats.import': 'SNBT / JSON ファイルをインポート…',
      'formats.exportBase64': '生の NBT を base64 でエクスポート',
      'formats.copyPython': 'Python（nbtlib）としてコピー',
      'formats.exportB64SNBT': 'SNBT を base64 としてコピー',
      'formats.recent': '▾ 最近のファイル',
      'formats.compare': '別の NBT ファイルと比較…',
      'compare.title': '{0} との差分',
      'compare.changes': '{0} 件の差分',
      'compare.identical': 'ファイルは同一です',
      'compare.close': '差分を閉じる',
      'toast.importedSNBT': 'SNBT からインポートしました',
      'toast.importedJSON': 'JSON からインポートしました',
      'err.importFailed': 'インポートに失敗しました: {0}',
      'insp.rename': '✎ 名前を変更',
      'insp.newTag': '＋ 新しいタグ',
      'insp.duplicate': '複製',
      'insp.delete': '削除',
      'insp.changeType': 'タイプを変更…',
      'insp.exportSNBT': 'SNBT をエクスポート',
      'insp.root': '（ルート）',
      'field.value': '値',
      'field.string': '文字列',
      'field.replaceBytes': 'バイトを置換（16進数または10進数、任意の区切り文字）',
      'str.length': '長さ: {0} 文字 · {1} バイト',
      'str.prettyJson': 'JSON のようです — 整形',
      'array.intTitle': 'int[] — {0}',
      'array.longTitle': 'long[] — {0}',
      'array.byteTitle': 'byte[] — {0} バイト',
      'array.addRow': '＋ 行を追加',
      'list.title': 'List<{0}> — {1}',
      'list.entryType': '要素タイプ',
      'list.add': '＋ {0} を追加',
      'compound.title': 'Compound — {0} エントリ',
      'compound.add': '＋ タグを追加',
      'chip.unsigned': '符号なし',
      'chip.hex': 'hex',
      'chip.char': '文字',
      'chip.exact': '正確',
      'chip.false': '偽',
      'chip.true': '真',
      'hex.empty': '（空）',
      'smart.items': 'アイテム',
      'smart.inventory': 'インベントリ',
      'smart.blockEntity': 'ブロックエンティティ',
      'smart.itemStack': 'アイテムスタック',
      'smart.inventoryCount': 'インベントリ（{0}）',
      'smart.structure': 'ストラクチャーデータ',
      'tree.unnamed': '（名前なし）',
      'tree.empty': '空',
      'tree.badge.tags': '{0} タグ',
      'tree.badge.items': '{0} アイテム',
      'lang.label': '言語',
      'btn.types.title': 'ローカライズした型名に切り替え',
      'type.0': 'End', 'type.1': 'バイト', 'type.2': 'ショート', 'type.3': '整数', 'type.4': 'ロング',
      'type.5': 'フロート', 'type.6': 'ダブル', 'type.7': 'バイト配列', 'type.8': '文字列',
      'type.9': 'リスト', 'type.10': 'コンパウンド', 'type.11': '整数配列', 'type.12': 'ロング配列',
    },
  };

  let lang = detectLang();
  let localizeTypes = false;
  try { localizeTypes = localStorage.getItem('webnbt-localize-types') === '1'; } catch (e) { /* ignore */ }

  function setLocalizeTypes(on) {
    localizeTypes = !!on;
    try { localStorage.setItem('webnbt-localize-types', localizeTypes ? '1' : '0'); } catch (e) { /* ignore */ }
    if (window.App && typeof window.App.refreshAll === 'function') {
      try { window.App.refreshAll(); } catch (e) { /* ignore */ }
    }
  }

  function detectLang() {
    try {
      const urlLang = new URLSearchParams(location.search).get('lang');
      if (LOCALES.includes(urlLang)) return urlLang;
    } catch (e) { /* ignore */ }
    try {
      const saved = localStorage.getItem('webnbt-lang');
      if (LOCALES.includes(saved)) return saved;
    } catch (e) { /* ignore */ }
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('ja')) return 'ja';
    return 'en';
  }

  function pick(key) {
    const d = dict[lang] || dict.en;
    const v = d[key];
    return v !== undefined ? v : dict.en[key];
  }

  function fill(str, args) {
    return String(str).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
  }

  function t(key, ...args) {
    let v = pick(key);
    if (Array.isArray(v)) v = v[0];
    return fill(v, args);
  }

  function pluralIndex(n, code) {
    if (code === 'ru') {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return 0;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1;
      return 2;
    }
    return n === 1 ? 0 : 1;
  }

  function tpl(key, n, ...args) {
    let v = pick(key);
    const forms = Array.isArray(v) ? v : [v];
    const idx = Math.min(pluralIndex(n, lang), forms.length - 1);
    return fill(forms[idx], [n, ...args]);
  }

  function setLang(code) {
    if (!LOCALES.includes(code)) return;
    lang = code;
    try { localStorage.setItem('webnbt-lang', code); } catch (e) { /* ignore */ }
    applyStatic();
    if (window.App && typeof window.App.refreshAll === 'function') {
      try { window.App.refreshAll(); } catch (e) { /* ignore */ }
    }
  }

  function ensureSelect() {
    const sel = document.getElementById('lang-select');
    if (!sel) return;
    if (sel.options.length === 0) {
      for (const code of LOCALES) {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = LOCALE_NAMES[code];
        sel.appendChild(o);
      }
    }
    sel.value = lang;
    if (!sel.onchange) {
      sel.addEventListener('change', () => setLang(sel.value));
    }
  }

  function applyStatic() {
    ensureSelect();
    document.documentElement.lang = lang;
    document.title = t('app.title');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureSelect();
    applyStatic();
  });

  ns.t = t;
  ns.tpl = tpl;
  ns.I18N = {
    t, tpl, setLang, setLocalizeTypes,
    get lang() { return lang; },
    get localizeTypes() { return localizeTypes; },
    locales: LOCALES,
  };

  return ns;
})(window.NBT || {});