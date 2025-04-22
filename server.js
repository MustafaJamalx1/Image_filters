const express = require('express');
const Jimp = require('jimp');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Image processing functions
async function cartoonify(image) {
    const blurred = image.clone().blur(5);
    const edges = await image.clone().greyscale().contrast(0.5)
        .convolute([[-1,-1,-1], [-1,8,-1], [-1,-1,-1]]);
    const quantized = blurred.posterize(6);
    edges.invert();
    return quantized.composite(edges, 0, 0, { mode: Jimp.BLEND_MULTIPLY, opacitySource: 0.6 });
}

async function pencilSketch(image) {
    const baseImage = image.clone().greyscale();
    const invertedBlurred = image.clone()
        .greyscale()
        .invert()
        .blur(10);

    baseImage.scan(0, 0, baseImage.bitmap.width, baseImage.bitmap.height, (x, y, idx) => {
        const baseValue = baseImage.bitmap.data[idx];
        const blurredValue = invertedBlurred.bitmap.data[idx];
        const result = Math.min(255, baseValue + (baseValue * blurredValue) / (255 - blurredValue + 1e-6));
        
        baseImage.bitmap.data[idx] = result;
        baseImage.bitmap.data[idx + 1] = result;
        baseImage.bitmap.data[idx + 2] = result;
    });

    return baseImage;
}

async function watercolor(image) {
    return image.clone()
        .blur(3)
        .blur(2)
        .color([{ apply: 'saturate', params: [30] }])
        .color([{ apply: 'lighten', params: [10] }]);
}

async function mosaic(image) {
    const size = 15;
    return image.clone()
        .resize(image.bitmap.width/size, image.bitmap.height/size, Jimp.RESIZE_NEAREST_NEIGHBOR)
        .resize(image.bitmap.width, image.bitmap.height, Jimp.RESIZE_NEAREST_NEIGHBOR);
}

async function emboss(image) {
    const grayImage = await image.clone().greyscale();
    return new Promise((resolve) => {
        grayImage.convolute([
            [-2, -1,  0],
            [-1,  1,  1],
            [ 0,  1,  2]
        ], (err, embossed) => {
            const threshold = 180;
            embossed.scan(0, 0, embossed.bitmap.width, embossed.bitmap.height, (x, y, idx) => {
                const brightness = embossed.bitmap.data[idx];
                const newValue = brightness > threshold ? 255 : 0;
                embossed.bitmap.data[idx] = newValue;
                embossed.bitmap.data[idx + 1] = newValue;
                embossed.bitmap.data[idx + 2] = newValue;
            });
            resolve(embossed);
        });
    });
}

app.post('/process', async (req, res) => {
    try {
        const { image, filter } = req.body;
        if (!image || !filter) return res.status(400).json({ error: 'Missing parameters' });

        const validFilters = ['cartoon', 'pencil', 'watercolor', 'mosaic', 'emboss'];
        if (!validFilters.includes(filter)) return res.status(400).json({ error: 'Invalid filter' });

        const base64Data = image.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const jimpImage = await Jimp.read(buffer);

        let processed;
        switch(filter) {
            case 'cartoon': processed = await cartoonify(jimpImage); break;
            case 'pencil': processed = await pencilSketch(jimpImage); break;
            case 'watercolor': processed = await watercolor(jimpImage); break;
            case 'mosaic': processed = await mosaic(jimpImage); break;
            case 'emboss': processed = await emboss(jimpImage); break;
        }

        const result = await processed.getBase64Async(Jimp.MIME_PNG);
        res.json({ result });
    } catch (error) {
        console.error('Processing error:', error);
        res.status(500).json({ error: error.message || 'Image processing failed' });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));