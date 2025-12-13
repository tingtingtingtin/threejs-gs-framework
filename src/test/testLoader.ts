import { SplatLoader } from '../classes/SplatLoader';

const TEST_URL = 'https://media.reshot.ai/models/nike_next/model.splat';

async function runSplatLoaderTest() {
    console.log('--- Starting SplatLoader Test ---');
    try {
        const loader = new SplatLoader();

        const { buffer, numSplats } = await loader.load(TEST_URL);
        console.log(`✅ File Fetched: Buffer Size = ${buffer.byteLength} bytes`);
        console.log(`✅ Header Read: Detected ${numSplats} splats`);

        const parsedData = SplatLoader.parse(buffer, numSplats)

        const { positions, scales, rotations, colorsFloat, opacityFloat, stride } = parsedData;

        // Check 1: Array Lengths (Fundamental Check)
        console.log(`\n--- Validation Check 1: Array Lengths ---`);
        const expectedPosLength = numSplats * 3;
        if (positions.length === expectedPosLength) {
            console.log(`✅ Positions length (${positions.length}) is correct (3 floats/splat)`);
        } else {
            console.error(`❌ Positions length Mismatch! Expected ${expectedPosLength}, got ${positions.length}`);
        }

        // Check 2: Stride Check (Internal Integrity)
        const totalParsedBytes = numSplats * stride;
        console.log(`✅ Calculated Stride: ${stride} bytes per splat`);
        console.log(`✅ Total Parsed Data Size: ${totalParsedBytes} bytes`);


        // Check 3: Data Inspection (Crucial for correct parsing)
        console.log(`\n--- Validation Check 3: Data Inspection (First Splat) ---`);
        const firstSplatIndex = 0;

        // Positions (should be reasonable float values, not zero)
        console.log(`Positions[${firstSplatIndex}]: ${positions[0].toFixed(3)}, ${positions[1].toFixed(3)}, ${positions[2].toFixed(3)}`);
        // Scales (usually small positive floats)
        console.log(`Scales[${firstSplatIndex}]: ${scales[0].toFixed(3)}, ${scales[1].toFixed(3)}, ${scales[2].toFixed(3)}`);
        // Rotations (quaternion components, should be between -1.0 and 1.0)
        console.log(`Rotations[${firstSplatIndex}]: ${rotations[0].toFixed(3)}, ${rotations[1].toFixed(3)}, ${rotations[2].toFixed(3)}, ${rotations[3].toFixed(3)}`);
        console.log(`ColorsFloat[${firstSplatIndex}]: R=${colorsFloat[0].toFixed(3)}, G=${colorsFloat[1].toFixed(3)}, B=${colorsFloat[2].toFixed(3)}`);
        console.log(`OpacityFloat[${firstSplatIndex}]: ${opacityFloat[0].toFixed(3)}`);

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        console.log('\n--- SplatLoader Test Complete ---');
    }
}

runSplatLoaderTest();