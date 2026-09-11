// 大写字母 A-Z
const UPPER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// 小写字母 a-z
const LOWER_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// 数字 0-9
const DIGITALS = "0123456789".split("");

// 其他可显示 ASCII 字符（除字母和数字以外的可打印字符）
const OTHER_CHARS = "!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~".split("");

// 所有字母（大写 + 小写）
const LETTERS = [...UPPER_LETTERS, ...LOWER_LETTERS];

/**
 * Shadow 风格版本字符编码表（索引即数值，共 64 个字符）。
 *
 * 编码规则（来自 BitTorrent 规范）：
 * `'0'-'9'=0-9`，`'A'-'Z'=10-35`，`'a'-'z'=36-61`，`'.'=62`，`'-'=63`
 *
 * @see https://wiki.theory.org/BitTorrentSpecification
 */
const SHADOW_STYLE_VERSION_CHARS = [
  ...DIGITALS,
  ...UPPER_LETTERS,
  ...LOWER_LETTERS,
  ".",
  "-",
];

/**
 * 随机字符串生成池：所有可显示 ASCII 字符（不含空格，33-126）。
 * 用于填充 PeerId 的随机部分。
 */
const VISIBLE_CHARS = [...LETTERS, ...DIGITALS, ...OTHER_CHARS];

export {
  DIGITALS,
  LETTERS,
  LOWER_LETTERS,
  OTHER_CHARS,
  SHADOW_STYLE_VERSION_CHARS,
  UPPER_LETTERS,
  VISIBLE_CHARS,
};
