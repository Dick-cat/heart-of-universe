const ALLOWED_PROTOCOLS = ['http:', 'https:'];

const METADATA_HOSTNAMES = [
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
  '169.254.169.253',
  '169.254.169.123',
  '100.100.100.200',
];

const METADATA_IP_RANGES = [
  /^169\.254\./,
];

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateLLMEndpoint(urlString: string): UrlValidationResult {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, reason: 'URL 不能为空' };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, reason: 'URL 格式无效' };
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return {
      valid: false,
      reason: `不支持的协议 ${url.protocol.replace(':', '')}。仅允许 http 和 https 协议。`,
    };
  }

  const hostname = url.hostname.toLowerCase().trim();

  if (METADATA_HOSTNAMES.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
    return { valid: false, reason: '禁止访问云服务元数据地址' };
  }

  if (isIpAddress(hostname) && isMetadataIp(hostname)) {
    return { valid: false, reason: '禁止访问云服务元数据地址' };
  }

  return { valid: true };
}

function isIpAddress(hostname: string): boolean {
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  return ipv4Pattern.test(hostname);
}

function isMetadataIp(ip: string): boolean {
  return METADATA_IP_RANGES.some((pattern) => pattern.test(ip));
}
