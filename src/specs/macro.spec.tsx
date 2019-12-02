import pluginTester from 'babel-plugin-tester';
import plugin from 'babel-plugin-macros';

const macroFile = "'./macro/macro/index.macro'";

pluginTester({
  plugin,
  babelOptions: { filename: __filename },
  tests: {
    'should throw an error if it is not invoked': {
      code: `
        import { producer } from ${macroFile}
        const a = producer 
      `,
      error: true
    },
    'should throw an error if it is not invoked with an arrow function': {
      code: `
        import { producer } from ${macroFile}
        producer(({
          foo= '123'
        }))
      `,
      error: true
    },
    'should throw an error if it is the arrow function is invoked with multiple params': {
      code: `
        import { producer } from ${macroFile}
        producer(({
          foo = '123'
        }, {
          bar = '123'
        }) => foo)
      `,
      error: true
    },
    'should throw an error if the parameter is not an object pattern': {
      code: `
        import { producer } from ${macroFile}
        producer((
          foo = '123'
        )) => foo)
      `,
      error: true
    },
    'should test a producer': {
      code: `
        import { producer } from ${macroFile}
        producer(({
          foo
        }) => {})
      `,
      snapshot: true,
      only: true
    }
  }
});
