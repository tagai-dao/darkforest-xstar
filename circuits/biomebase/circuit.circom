/*
    Prove: I know (x,y) such that:
    - biomeperlin(x, y) = biomeBase
    - MiMCSponge(x,y) = hash
*/

include "../perlin/perlin.circom";

template Main() {
    signal input x;
    signal input y;
    // todo: label this as planetHashKey
    signal input PLANETHASH_KEY;
    signal input BIOMEBASE_KEY;
    // SCALE is the length scale of the perlin function.
    // You can imagine that the perlin function can be scaled up or down to have features at smaller or larger scales, i.e. is it wiggly at the scale of 1000 units or is it wiggly at the scale of 10000 units.
    // must be power of 2 at most 16384 so that DENOMINATOR works
    signal input SCALE;
    signal input xMirror; // 1 is true, 0 is false
    signal input yMirror; // 1 is true, 0 is false

    signal output hash;
    signal output biomeBase;

    /* check MiMCSponge(x,y) = pub */
    /*
        Planet location hash uses 1000 rounds. Perlin inside this circuit stays at 4.
    */
    component mimc = MiMCSponge(2, 1000, 1);

    mimc.ins[0] <== x;
    mimc.ins[1] <== y;
    mimc.k <== PLANETHASH_KEY;

    hash <== mimc.outs[0];

    /* check perlin(x, y) = p */
    component perlin = MultiScalePerlin();
    perlin.p[0] <== x;
    perlin.p[1] <== y;
    perlin.SCALE <== SCALE;
    perlin.xMirror <== xMirror;
    perlin.yMirror <== yMirror;
    perlin.KEY <== BIOMEBASE_KEY;
    biomeBase <== perlin.out;
}

component main {public [PLANETHASH_KEY, BIOMEBASE_KEY, SCALE, xMirror, yMirror]} = Main();
