/* Does a handler's operand stack balance?
 *
 * A Lingo handler that leaves values behind, or pops more than it pushed, does
 * not fail politely — the interpreter keeps going on a stack that no longer
 * means what it thinks, and the projector can die outright rather than raising
 * a script error. So this walks a handler's control-flow graph tracking the
 * depth at every instruction and reports three things:
 *
 *     - a depth that goes negative                (popped past the bottom)
 *     - an offset reached at two different depths (branches disagree)
 *     - a non-zero depth at a return              (left something behind)
 *
 * The stack effects below are checked the only way worth trusting: `--verify`
 * runs this over every handler in the client, all of which were emitted by
 * Director's own compiler and must therefore balance. If the table were wrong,
 * that run would light up.
 *
 * Calls are the one case needing context. An extCall/objCall/theBuiltin pops
 * the arglist the instruction before it pushed, and then pushes a result only
 * if that arglist was the value-wanted form (0x43) rather than the command
 * form (0x42) — so the effect of a call depends on its arglist, which this
 * tracks per instruction rather than assuming.
 */

const PUSH1 = new Set([0x03, 0x41, 0x44, 0x45, 0x46, 0x48, 0x49, 0x4a, 0x4b,
    0x4c, 0x5f, 0x64, 0x6e, 0x6f, 0x71, 0x72]);
const POP1 = new Set([0x4e, 0x4f, 0x50, 0x51, 0x52, 0x55, 0x60]);
const NEUTRAL = new Set([0x09, 0x14, 0x1e, 0x1f, 0x21, 0x53, 0x54, 0x61, 0x70]);
const BINOP = new Set([0x04, 0x05, 0x06, 0x07, 0x08, 0x0a, 0x0b, 0x0c, 0x0d,
    0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x15, 0x16]);
const CALL = new Set([0x56, 0x57, 0x58, 0x63, 0x66, 0x67, 0x73]);

/* Returns the change in depth, or null if the opcode is not modelled. */
function effect(ins, prevArgList) {
    const op = ins.op;
    if (op === 0x01 || op === 0x02) return 0;
    if (PUSH1.has(op)) return 1;
    if (POP1.has(op)) return -1;
    if (NEUTRAL.has(op)) return 0;
    if (BINOP.has(op)) return -1;
    if (op === 0x42 || op === 0x43) return 1 - ins.operand;
    if (op === 0x65) return -ins.operand;
    if (op === 0x62) return -2;
    if (op === 0x5d) return -3;
    if (op === 0x17) return -4;
    if (op === 0x59) return -2;
    /* Chunk and field access, none of which this file emits — modelled only so
       the client-wide check can reach zero and mean something. */
    if (op === 0x1b || op === 0x6d) return 0;
    if (op === 0x5c) return 1;
    if (op === 0x5b) return -1;
    if (CALL.has(op)) return prevArgList === 0x43 ? 0 : -1;
    return null;
}

/* `return expr` compiles to an extCall of a handler literally named "return",
   and it does NOT fall through — the path ends there. Treating it as an
   ordinary call makes the instruction after it look reachable at the wrong
   depth, which is what 135 of the client's own handlers looked like before
   this was accounted for. */
function check(code, returnNameId) {
    const isReturn = (ins) => ins.op === 0x57 && ins.operand === returnNameId;
    const byOffset = new Map();
    code.forEach((ins, i) => byOffset.set(ins.at, i));

    const depth = new Map();          // instruction index -> depth on entry
    const problems = [];
    const queue = [[0, 0]];
    depth.set(0, 0);

    while (queue.length) {
        const [i, d] = queue.shift();
        const ins = code[i];
        if (!ins) continue;
        const prev = i > 0 ? code[i - 1].op : null;
        const e = effect(ins, prev === 0x42 || prev === 0x43 ? prev : null);
        if (e === null) { problems.push(`op_${ins.op.toString(16)} at ${ins.at} not modelled`); continue; }

        const after = d + e;
        if (after < 0) problems.push(`stack went negative at ${ins.at} (op_${ins.op.toString(16)})`);
        if (ins.op === 0x01 && d !== 0) problems.push(`return at ${ins.at} with ${d} left on the stack`);

        const go = (target) => {
            if (target === undefined) return;
            const seen = depth.get(target);
            if (seen === undefined) { depth.set(target, after); queue.push([target, after]); }
            else if (seen !== after) problems.push(`instruction ${code[target].at} reached at depth ${seen} and ${after}`);
        };

        if (ins.op === 0x01 || isReturn(ins)) continue;      // the path ends here
        if (ins.op === 0x53) { go(byOffset.get(ins.at + ins.operand)); continue; }
        if (ins.op === 0x54) { go(byOffset.get(ins.at - ins.operand)); continue; }
        if (ins.op === 0x55) go(byOffset.get(ins.at + ins.operand));
        go(i + 1);
    }
    return problems;
}

module.exports = { check, effect };

if (require.main === module) {
    const fs = require("fs");
    const { openClient, CLIENT, disassemble } = require("./lingo-client.js");
    const only = process.argv[2];

    let handlers = 0, bad = 0;
    const examples = [];
    for (const f of fs.readdirSync(CLIENT).filter(x => /\.cct$/i.test(x)).sort()) {
        if (only && f !== only) continue;
        let c; try { c = openClient(f); } catch { continue; }
        for (const s of c.scripts) {
            for (const h of s.handlers) {
                if (!h.codeLength) continue;
                handlers++;
                const p = check(disassemble(s.chunk, h).code, s.names.indexOf("return"));
                if (p.length) {
                    bad++;
                    if (examples.length < 12) examples.push(`${f}#${s.id} ${h.name}: ${p[0]}`);
                }
            }
        }
    }
    console.log(`${handlers} handlers checked, ${bad} with a stack problem`);
    for (const e of examples) console.log(`  ${e}`);
    process.exit(bad ? 1 : 0);
}
