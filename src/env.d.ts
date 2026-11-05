/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_YANDEX_METRICA_ID?: string;
  readonly SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
