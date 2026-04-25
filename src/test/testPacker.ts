import { mat3Mul, mat3MulDiag, transpose3, quatToMat3, floatToHalf } from "../utils/splatMath.ts";

const scale: [number, number, number] = [
  0.00959171261638403, 0.009873669594526291, 0.00838983803987503,
];
const rotation: [number, number, number, number] = [0.9921875, -0.0078125, 0.0390625, 0.0703125];

const R = quatToMat3(rotation);
const s2 = [scale[0] ** 2, scale[1] ** 2, scale[2] ** 2];
const V = mat3Mul(mat3Mul(transpose3(R), mat3MulDiag(s2)), R);

console.log("V (cov3d):", V);
console.log("packed[4]:", floatToHalf(V[0] * 4), floatToHalf(V[1] * 4));
console.log("packed[5]:", floatToHalf(V[2] * 4), floatToHalf(V[4] * 4));
console.log("packed[6]:", floatToHalf(V[5] * 4), floatToHalf(V[8] * 4));

console.log("V[0]*4:", V[0] * 4, "floatToHalf:", floatToHalf(V[0] * 4));
console.log("V[1]*4:", V[1] * 4, "floatToHalf:", floatToHalf(V[1] * 4));
console.log("V[2]*4:", V[2] * 4, "floatToHalf:", floatToHalf(V[2] * 4));
console.log("V[4]*4:", V[4] * 4, "floatToHalf:", floatToHalf(V[4] * 4));
console.log("V[5]*4:", V[5] * 4, "floatToHalf:", floatToHalf(V[5] * 4));
console.log("V[8]*4:", V[8] * 4, "floatToHalf:", floatToHalf(V[8] * 4));
