const assert = require('assert');
const { createVoice } = require('../web/js/voice');

function state(over) {
  return Object.assign(
    { stepIndex: 1, instruction: 'Turn right onto Mill St', distanceToNextM: 500, arrived: false },
    over
  );
}

module.exports = [
  {
    name: 'stays silent until the 400 m threshold, then speaks once',
    fn: async () => {
      const said = [];
      const v = createVoice({ speak: (t) => said.push(t) });
      v.onUpdate(state({ distanceToNextM: 450 }));
      assert.deepStrictEqual(said, []);
      v.onUpdate(state({ distanceToNextM: 380 }));
      v.onUpdate(state({ distanceToNextM: 360 }));
      assert.deepStrictEqual(said, ['In 400 metres, turn right onto Mill St']);
    },
  },
  {
    name: 'a jump past several thresholds speaks only the closest one, not a stack',
    fn: async () => {
      const said = [];
      const v = createVoice({ speak: (t) => said.push(t) });
      v.onUpdate(state({ distanceToNextM: 15 }));
      assert.deepStrictEqual(said, ['Turn right onto Mill St']);
      v.onUpdate(state({ distanceToNextM: 10 }));
      assert.strictEqual(said.length, 1);
    },
  },
  {
    name: 'a new manoeuvre resets the thresholds',
    fn: async () => {
      const said = [];
      const v = createVoice({ speak: (t) => said.push(t) });
      v.onUpdate(state({ distanceToNextM: 90 }));
      v.onUpdate(state({ stepIndex: 2, instruction: 'You have arrived', distanceToNextM: 300 }));
      v.onUpdate(state({ stepIndex: 2, instruction: 'You have arrived', distanceToNextM: 90 }));
      // step 1 at 90 m: "In 100 metres"; step 2 at 300 m: "In 400 metres"; step 2 at 90 m: "In 100 metres"
      assert.strictEqual(said.length, 3);
    },
  },
  {
    name: 'arrival is spoken once',
    fn: async () => {
      const said = [];
      const v = createVoice({ speak: (t) => said.push(t) });
      v.onUpdate(state({ stepIndex: 2, instruction: 'You have arrived', distanceToNextM: 0, arrived: true }));
      v.onUpdate(state({ stepIndex: 2, instruction: 'You have arrived', distanceToNextM: 0, arrived: true }));
      assert.deepStrictEqual(said, ['You have arrived']);
    },
  },
];
