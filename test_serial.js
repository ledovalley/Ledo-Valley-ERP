const underProcess = [];
const historyList = [
  { details: { blendName: 'Test | SL-01' } },
  { details: { blendName: 'Another | SL-05' } }
];

let finalBlendName = "My New Blend";
let maxSerial = 0;

const extractSerial = (name) => {
  if (!name) return;
  const match = name.match(/\|\s*SL-(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num > maxSerial) maxSerial = num;
  }
};

underProcess.forEach(b => extractSerial(b.blendName));
historyList.forEach(h => {
  if (h.details && h.details.blendName) {
    extractSerial(h.details.blendName);
  }
});

const nextSL = `SL-${(maxSerial + 1).toString().padStart(2, '0')}`;
finalBlendName = `${finalBlendName} | ${nextSL}`;
console.log(finalBlendName);
