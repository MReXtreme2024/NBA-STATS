import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterLines } from '../updater/quarters.js';

const play = (period, type, text, ids, scoreValue = 0) => ({
  period: { number: period }, type: { text: type }, text, scoringPlay: scoreValue > 0, scoreValue,
  participants: ids.map((id) => ({ athlete: { id } })),
});

test('quarter lines: points to the scorer, assists to the passer, rebounds by quarter, overtime together', () => {
  const q = quarterLines({ plays: [
    play(1, 'Jump Shot', 'A makes 22-foot three point jumper (B assists)', ['a', 'b'], 3),
    play(1, 'Defensive Rebound', 'B defensive rebound', ['b']),
    play(2, 'Free Throw - 1 of 2', 'A makes free throw 1 of 2', ['a'], 1),
    play(2, 'Jump Shot', 'A misses 20-foot jumper', ['a']),
    play(2, 'Offensive Rebound', 'Thunder offensive team rebound', []),
    play(4, 'Layup Shot', 'B makes layup', ['b'], 2),
    play(5, 'Dunk', 'A makes dunk (B assists)', ['a', 'b'], 2),
    play(6, 'Dunk', 'A makes dunk', ['a'], 2),
  ] });
  assert.deepEqual(q.a, [[3, 0, 0], [1, 0, 0], [0, 0, 0], [0, 0, 0], [4, 0, 0]]);
  assert.deepEqual(q.b, [[0, 1, 1], [0, 0, 0], [0, 0, 0], [2, 0, 0], [0, 0, 1]]);
  assert.equal(quarterLines({ plays: [] }), null);
});
