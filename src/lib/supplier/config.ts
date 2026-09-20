function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const supplierConfig = {
  get baseUrl() {
    return process.env.SUPPLIER_BASE_URL ?? "https://b2b-rustfood.dinonline.nl";
  },
  get username() {
    return required("SUPPLIER_USERNAME");
  },
  get password() {
    return required("SUPPLIER_PASSWORD");
  },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
};
