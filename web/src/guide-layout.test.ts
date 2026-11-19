import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { avoidInstrumentPanel } from './guide-layout';

test('keeps a clear ring guide in its projected position', () => {
  const hud={left:12,right:488,top:76,bottom:180};
  a.deepEqual(avoidInstrumentPanel(330,230,80,44,hud),{x:330,y:230});
});

test('moves the whole guide below a full-width compact panel', () => {
  const hud={left:12,right:488,top:76,bottom:180};
  a.deepEqual(avoidInstrumentPanel(330,167,80,44,hud),{x:330,y:210});
});

test('uses the shorter clear path to the left of a side panel', () => {
  const hud={left:480,right:664,top:94,bottom:270};
  a.deepEqual(avoidInstrumentPanel(495,130,80,44,hud),{x:432,y:130});
});
