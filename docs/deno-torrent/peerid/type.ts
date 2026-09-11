/**
 * 表示一个 BitTorrent 客户端的基本信息。
 */
export type Client = {
  /** 客户端代号（Azureus 风格 2 位，Shadow 风格 1 位） */
  code: string;
  /** 客户端名称（若在已知列表中可识别，否则为 undefined） */
  name?: string;
  /** 语义化版本号，格式 `major.minor.patch`（若可解析，否则为 undefined） */
  version?: string;
};
