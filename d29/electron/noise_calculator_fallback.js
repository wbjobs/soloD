function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isInvalidNumber(value) {
  return value === null || value === undefined || isNaN(value) || !isFinite(value);
}

function calculateFrequencies(start, end, points) {
  if (isInvalidNumber(start) || isInvalidNumber(end) || isInvalidNumber(points)) {
    start = 1;
    end = 1e6;
    points = 100;
  }
  
  start = clamp(start, 0.01, 1e12);
  end = clamp(end, 0.01, 1e12);
  points = Math.max(2, Math.min(1000, Math.floor(points)));
  
  if (start >= end) {
    [start, end] = [0.01, 1e6];
  }
  
  const frequencies = [];
  const logStart = Math.log10(start);
  const logEnd = Math.log10(end);
  const step = (logEnd - logStart) / (points - 1);

  for (let i = 0; i < points; ++i) {
    const logFreq = logStart + step * i;
    const freq = Math.pow(10, logFreq);
    frequencies.push(isInvalidNumber(freq) ? 1 : freq);
  }
  return frequencies;
}

function calculateNoise(circuitData) {
  try {
    const elements = Array.isArray(circuitData.elements) ? circuitData.elements : [];
    const startFreq = circuitData.frequencyRange?.start || 1;
    const endFreq = circuitData.frequencyRange?.end || 1e6;
    const numPoints = circuitData.frequencyRange?.points || 100;

    const frequencies = calculateFrequencies(startFreq, endFreq, numPoints);
    const actualPoints = frequencies.length;
    
    const totalNoise = new Array(actualPoints).fill(0);
    const resistorNoise = new Array(actualPoints).fill(0);
    const opampVoltageNoise = new Array(actualPoints).fill(0);
    const opampCurrentNoise = new Array(actualPoints).fill(0);

    const BOLTZMANN_CONSTANT = 1.380649e-23;
    const MAX_NOISE = 1e-6;

    for (const element of elements) {
      if (!element || !element.type) continue;
      
      const type = element.type;
      const rawValue = element.value;
      const value = isInvalidNumber(rawValue) ? 0 : clamp(rawValue, 0, 1e12);

      if (type === 'resistor') {
        const rawTemp = element.params?.temperature;
        const temp = isInvalidNumber(rawTemp) ? 300.0 : clamp(rawTemp, 0.01, 10000);
        const noisePerFreq = 4.0 * BOLTZMANN_CONSTANT * temp * value;
        const safeNoise = isInvalidNumber(noisePerFreq) ? 0 : clamp(noisePerFreq, 0, MAX_NOISE);
        
        for (let j = 0; j < actualPoints; ++j) {
          resistorNoise[j] = clamp(resistorNoise[j] + safeNoise, 0, MAX_NOISE * 100);
          totalNoise[j] = clamp(totalNoise[j] + safeNoise, 0, MAX_NOISE * 100);
        }
      } else if (type === 'opamp') {
        const rawVn = element.params?.voltageNoise;
        const rawIn = element.params?.currentNoise;
        const rawFc = element.params?.cornerFrequency;
        
        const vn = isInvalidNumber(rawVn) ? 10e-9 : clamp(rawVn, 1e-12, 1e-3);
        const in_val = isInvalidNumber(rawIn) ? 1e-12 : clamp(rawIn, 1e-18, 1e-6);
        const fc = isInvalidNumber(rawFc) ? 100.0 : clamp(rawFc, 0.01, 1e6);

        for (let j = 0; j < actualPoints; ++j) {
          const freq = frequencies[j];
          const flickerFactor = 1.0 + (fc / freq);
          const safeFlicker = isInvalidNumber(flickerFactor) ? 1.0 : clamp(flickerFactor, 1.0, 1e6);
          
          const vNoise = vn * vn * safeFlicker;
          const safeVNoise = isInvalidNumber(vNoise) ? 0 : clamp(vNoise, 0, MAX_NOISE);
          
          opampVoltageNoise[j] = clamp(opampVoltageNoise[j] + safeVNoise, 0, MAX_NOISE * 100);
          totalNoise[j] = clamp(totalNoise[j] + safeVNoise, 0, MAX_NOISE * 100);
        }
      }
    }

    for (let j = 0; j < actualPoints; ++j) {
      if (isInvalidNumber(totalNoise[j])) totalNoise[j] = 0;
      if (isInvalidNumber(resistorNoise[j])) resistorNoise[j] = 0;
      if (isInvalidNumber(opampVoltageNoise[j])) opampVoltageNoise[j] = 0;
      if (isInvalidNumber(opampCurrentNoise[j])) opampCurrentNoise[j] = 0;
    }

    return {
      frequencies,
      totalNoiseSpectralDensity: totalNoise,
      resistorNoiseSpectralDensity: resistorNoise,
      opampVoltageNoiseSpectralDensity: opampVoltageNoise,
      opampCurrentNoiseSpectralDensity: opampCurrentNoise
    };
  } catch (error) {
    console.error('Error in noise calculation:', error);
    return {
      frequencies: calculateFrequencies(1, 1e6, 100),
      totalNoiseSpectralDensity: new Array(100).fill(0),
      resistorNoiseSpectralDensity: new Array(100).fill(0),
      opampVoltageNoiseSpectralDensity: new Array(100).fill(0),
      opampCurrentNoiseSpectralDensity: new Array(100).fill(0)
    };
  }
}

function gaussianRandom(mean = 0, stdDev = 1) {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

function applyTolerance(value, tolerancePercent, distribution = 'uniform') {
  if (value === null || value === undefined || value === 0) return value;
  
  const tolerance = tolerancePercent / 100;
  
  if (distribution === 'uniform') {
    const factor = 1 + (Math.random() * 2 - 1) * tolerance;
    return value * factor;
  } else if (distribution === 'gaussian') {
    const stdDev = tolerance / 3;
    const factor = 1 + gaussianRandom(0, stdDev);
    return value * clamp(factor, 1 - tolerance * 2, 1 + tolerance * 2);
  }
  
  return value;
}

function calculateStatistics(values) {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, p25: 0, p75: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  return {
    mean,
    stdDev,
    min: sorted[0],
    max: sorted[n - 1],
    median: sorted[Math.floor(n / 2)],
    p25: sorted[Math.floor(n * 0.25)],
    p75: sorted[Math.floor(n * 0.75)]
  };
}

function monteCarloAnalysis(circuitData, options = {}) {
  const numRuns = options.numRuns || 100;
  const tolerancePercent = options.tolerancePercent !== undefined ? options.tolerancePercent : 5;
  const distribution = options.distribution || 'uniform';
  
  console.log(`Starting Monte Carlo: ${numRuns} runs, ±${tolerancePercent}% tolerance`);
  
  const allResults = [];
  const elementsWithTolerance = ['resistor', 'capacitor'];
  
  for (let run = 0; run < numRuns; run++) {
    const perturbedElements = circuitData.elements.map(el => {
      if (elementsWithTolerance.includes(el.type) && el.value) {
        const perturbedValue = applyTolerance(el.value, tolerancePercent, distribution);
        return { ...el, value: perturbedValue };
      }
      return el;
    });
    
    const perturbedCircuitData = {
      ...circuitData,
      elements: perturbedElements
    };
    
    const result = calculateNoise(perturbedCircuitData);
    allResults.push(result);
  }
  
  const numFrequencies = allResults[0].frequencies.length;
  const statisticsByFrequency = [];
  const allNoiseByFrequency = Array(numFrequencies).fill(null).map(() => []);
  
  allResults.forEach(result => {
    result.totalNoiseSpectralDensity.forEach((noise, idx) => {
      allNoiseByFrequency[idx].push(noise);
    });
  });
  
  for (let idx = 0; idx < numFrequencies; idx++) {
    statisticsByFrequency.push(calculateStatistics(allNoiseByFrequency[idx]));
  }
  
  const totalNoiseAtOutput = allResults.map(r => {
    const lastIdx = r.totalNoiseSpectralDensity.length - 1;
    return Math.sqrt(r.totalNoiseSpectralDensity[lastIdx]) * 1e9;
  });
  
  const overallStats = calculateStatistics(totalNoiseAtOutput);
  
  return {
    numRuns,
    tolerancePercent,
    distribution,
    frequencies: allResults[0].frequencies,
    statisticsByFrequency,
    overallStats,
    allResults: options.includeAllResults ? allResults : undefined,
    totalNoiseAtOutput
  };
}

module.exports = { calculateNoise, monteCarloAnalysis };
