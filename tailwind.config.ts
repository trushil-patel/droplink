import type { Config } from 'tailwindcss';
const config: Config = { content:['./app/**/*.{ts,tsx}','./components/**/*.{ts,tsx}'], theme:{extend:{colors:{ink:'#07111f',electric:'#2377ff'},boxShadow:{glow:'0 0 55px rgba(39,119,255,.25)'}}}, plugins:[] };
export default config;
