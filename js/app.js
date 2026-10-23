// Kate Comic - AI Drawing Animator using Hugging Face Stable Video Diffusion

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let currentTool = 'pen';
let lastX = 0, lastY = 0;
let selectedStyle = 'cartoon';

// Animation prompts for each style
const stylePrompts = {
    cartoon: "bouncing up and down energetically in a fun cartoon way",
    robot: "walking forward with stiff mechanical steps, arms swinging",
    monster: "wobbling and squirming with organic movement, eyes blinking",
    ghost: "floating gently through the air, translucent and ethereal",
    vehicle: "driving forward on a road, wheels spinning",
    dancing: "dancing rhythmically to upbeat music, swaying side to side"
};

// Initialize canvas
function initCanvas() {
    const wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    canvas.height = 400;
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

initCanvas();
window.addEventListener('resize', initCanvas);

// Drawing tools
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
    });
});

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const pos = getPos(e);
    const color = document.getElementById('pen-color').value;
    const size = parseInt(document.getElementById('brush-size').value);
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    
    if (currentTool === 'eraser') {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = size * 3;
    } else if (currentTool === 'brush') {
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 2;
        ctx.lineCap = 'round';
    } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
    }
    
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseleave', () => isDrawing = false);

document.getElementById('clear-canvas').addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});

// Style selection
document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedStyle = btn.dataset.style;
    });
});

// Generate animation using Hugging Face API
document.getElementById('generate-btn').addEventListener('click', generateAnimation);

async function generateAnimation() {
    const loading = document.getElementById('loading');
    const stageSection = document.getElementById('stage-section');
    
    // Find drawing bounds and crop
    const bounds = findDrawingBounds();
    if (!bounds) {
        alert('Draw something first!');
        return;
    }
    
    // Crop to just the drawing with padding
    const pad = 20;
    const cropX = Math.max(0, bounds.x - pad);
    const cropY = Math.max(0, bounds.y - pad);
    const cropW = Math.min(canvas.width - cropX, bounds.w + pad * 2);
    const cropH = Math.min(canvas.height - cropY, bounds.h + pad * 2);
    
    // Create cropped canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    // Convert to blob for upload
    cropCanvas.toBlob(async (blob) => {
        loading.classList.remove('hidden');
        stageSection.classList.add('hidden');
        
        try {
            const videoUrl = await animateWithHF(blob, stylePrompts[selectedStyle]);
            
            loading.classList.add('hidden');
            
            // Display video
            const stage = document.getElementById('animation-stage');
            stage.innerHTML = '';
            
            const video = document.createElement('video');
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.style.maxWidth = '100%';
            
            stage.appendChild(video);
            stageSection.classList.remove('hidden');
            
            // Update download button
            document.getElementById('download-video-btn').onclick = () => {
                const link = document.createElement('a');
                link.href = videoUrl;
                link.download = 'my-animated-drawing.mp4';
                link.click();
            };
            
        } catch (error) {
            loading.classList.add('hidden');
            alert('Error animating: ' + error.message);
            console.error(error);
        }
    }, 'image/png');
}

async function animateWithHF(imageBlob, prompt) {
    const token = document.getElementById('hf-token').value.trim();
    
    // Use Hugging Face Inference API with Stable Video Diffusion
    const url = 'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid';
    
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Convert blob to base64
    const base64 = await blobToBase64(imageBlob);
    
    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            inputs: base64,
            parameters: {
                prompt: prompt,
                num_frames: 25,
                fps: 8
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API returned ${response.status}`);
    }
    
    // API returns video blob directly (synchronous endpoint)
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function findDrawingBounds() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            if (pixels[idx] < 250 || pixels[idx+1] < 250 || pixels[idx+2] < 250) {
                found = true;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    if (!found) return null;
    
    return {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1
    };
}

// Replay animation
document.getElementById('replay-btn').addEventListener('click', () => {
    const video = document.querySelector('#animation-stage video');
    if (video) {
        video.currentTime = 0;
        video.play();
    }
});