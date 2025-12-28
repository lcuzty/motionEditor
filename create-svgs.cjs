const fs = require('fs');
const path = require('path');

const svgs = [
    'motion-editor-undo.svg',
    'motion-editor-redo.svg',
    'motion-editor-focus.svg',
    'motion-editor-hide.svg',
    'motion-editor-drag.svg',
    'motion-editor-camera-track.svg',
    'motion-editor-edit-position.svg',
    'motion-editor-path-board.svg',
    'motion-editor-data-board.svg',
    'motion-editor-scene-axes.svg',
    'motion-editor-scene-grid.svg',
    'motion-editor-save-2.svg',
    'motion-editor-window-max.svg',
    'motion-editor-window-normal.svg',
    'motion-editor-layer.svg',
    'motion-editor-quiz.svg',
    'motion-editor-locked.svg',
    'motion-editor-curve.svg',
    'motion-editor-settings.svg',
    'motion-editor-close.svg',
    'motion-editor-check.svg',
    'motion-editor-check-off.svg',
    'motion-editor-frame-last.svg',
    'motion-editor-frame-next.svg',
    'motion-editor-frame-play.svg',
    'motion-editor-frame-pause.svg',
    'motion-editor-frame-stop.svg',
    'motion-editor-path-board-sync-frame-selected.svg',
    'motion-editor-path-board-sync-frame-selected-off.svg',
    'motion-editor-path-board-copy.svg',
    'motion-editor-delete.svg',
    'motion-editor-reset.svg',
    'motion-editor-rotate.svg',
    'motion-editor-hover.svg',
    'motion-editor-fixed.svg'
];

const targetDir = path.resolve('src/assets/svg');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const content = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" fill="#CCC"/></svg>`;

svgs.forEach(file => {
    fs.writeFileSync(path.join(targetDir, file), content.replace('#CCC', '#' + Math.floor(Math.random() * 16777215).toString(16)));
    console.log(`Created ${file}`);
});
