// svelte-eslint-parser は、.svelte を TypeScript に変換して型の検査に渡す。この変数がないと、TypeScript はディスクの .svelte をそのまま読み、
// 変換後の内容と食い違うので、.svelte を 1 つ読むたびに型情報を作り直す (lint が 2 倍ほど遅くなる)。
// parser は読み込まれたときにこの変数を見るので、eslint.config.js の最初に import して、ほかの import より先に設定する
process.env['SVELTE_ESLINT_PARSER_EXPERIMENTAL_TS_SYS_HOOK'] ??= '1';
