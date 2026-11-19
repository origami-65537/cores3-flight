import { test } from 'node:test';
import { strict as a } from 'node:assert';
import { parseImu, axis } from './input';
test('firmware IMU frame and button mask', () => { a.deepEqual(parseImu('{"t":"imu","r":12.5,"p":-3,"y":90,"b":3}'), {t:'imu',r:12.5,p:-3,y:90,b:3}); });
test('empty, malformed and unexpected serial lines', () => { for (const line of ['', 'boot message', '{}','{"t":"radar"}','{"t":"imu","r":null,"p":0,"y":0,"b":0}','{"t":"imu","r":0,"p":0,"y":0,"b":4}']) a.equal(parseImu(line),null); });
test('deadzone and normalized bounds', () => { a.equal(axis(0),0); a.equal(axis(1),0); a.equal(axis(90),1); a.equal(axis(-90),-1); a.ok(axis(15)>0 && axis(15)<1); });
