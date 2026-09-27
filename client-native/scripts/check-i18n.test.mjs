import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLocales, checkHardcoded } from './check-i18n.mjs';

const en = { home: { title: 'Home', greet: 'Hi {{name}}' } };

test('passes when all locales match English', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते {{name}}' } };
  assert.deepEqual(checkLocales({ en, hi }, []), []);
});

test('reports a key missing from a locale', () => {
  const hi = { home: { title: 'होम' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: missing home\.greet/);
});

test('reports an extra key not in English', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते {{name}}', extra: 'x' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: extra home\.extra/);
});

test('reports text in the wrong script', () => {
  const ta = { home: { title: 'Home', greet: 'வணக்கம் {{name}}' } };
  assert.match(checkLocales({ en, ta }, []).join('\n'), /ta: home\.title is not in Tamil script/);
});

test('reports a dropped interpolation placeholder', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: home\.greet lost \{\{name\}\}/);
});

test('reports a key used in source but missing from English', () => {
  const src = [{ path: 'a.js', text: "t('home.title'); t(\"home.nope\")" }];
  assert.match(checkLocales({ en }, src).join('\n'), /a\.js uses missing key home\.nope/);
});

test('treats <tag> markup as script-neutral', () => {
  const enT = { a: { terms: 'Agree to <terms>Terms</terms>' } };
  const hi = { a: { terms: '<terms>शर्तें</terms> मानें' } };
  assert.deepEqual(checkLocales({ en: enT, hi }, []), []);
});

test('reports hardcoded JSX text in src/app or src/components', () => {
  const files = [{ path: 'src/app/foo.js', text: '<Text>Hello there</Text>' }];
  assert.match(checkHardcoded(files).join('\n'), /hardcoded JSX text "Hello there"/);
});

test('reports a hardcoded string prop', () => {
  const files = [{ path: 'src/components/Foo.js', text: '<TextField label="Full name" />' }];
  assert.match(checkHardcoded(files).join('\n'), /hardcoded prop label="Full name"/);
});

test('reports a hardcoded Alert.alert argument', () => {
  const files = [{ path: 'src/app/bar.js', text: "Alert.alert('Error', 'Something went wrong')" }];
  assert.match(checkHardcoded(files).join('\n'), /hardcoded Alert\.alert\("Error"\)/);
});

test('skips a line marked with // i18n-ignore or the line before it', () => {
  const files = [
    {
      path: 'src/app/baz.js',
      text: [
        '<Text>Debug info</Text> // i18n-ignore',
        '// i18n-ignore',
        '<Text>Also debug</Text>',
      ].join('\n'),
    },
  ];
  assert.deepEqual(checkHardcoded(files), []);
});

test('does not flag a clean, translated file', () => {
  const files = [
    {
      path: 'src/app/clean.js',
      text: [
        "<Text>{t('home.title')}</Text>",
        '<TextField label={t(\'home.label\')} placeholder="number-pad" />',
        "Alert.alert(t('common.error'), t('common.retry'))",
      ].join('\n'),
    },
  ];
  assert.deepEqual(checkHardcoded(files), []);
});
