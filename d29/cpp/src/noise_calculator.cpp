#include <napi.h>
#include "circuit_elements.h"
#include <vector>
#include <memory>
#include <cmath>
#include <limits>
#include <algorithm>

namespace {
    inline double clamp(double value, double min_val, double max_val) {
        return std::max(min_val, std::min(max_val, value));
    }

    inline bool isInvalidNumber(double value) {
        return std::isnan(value) || std::isinf(value);
    }

    inline double safeDouble(Napi::Value val, double defaultValue) {
        if (!val.IsNumber()) return defaultValue;
        double result = val.As<Napi::Number>().DoubleValue();
        return isInvalidNumber(result) ? defaultValue : result;
    }

    inline int safeInt(Napi::Value val, int defaultValue) {
        if (!val.IsNumber()) return defaultValue;
        int result = val.As<Napi::Number>().Int32Value();
        return isInvalidNumber(static_cast<double>(result)) ? defaultValue : result;
    }
}

class NoiseCalculator {
public:
    static std::vector<double> calculateFrequencies(double start, double end, int points) {
        if (isInvalidNumber(start) || isInvalidNumber(end) || isInvalidNumber(static_cast<double>(points))) {
            start = 1.0;
            end = 1e6;
            points = 100;
        }
        
        start = clamp(start, 0.01, 1e12);
        end = clamp(end, 0.01, 1e12);
        points = std::max(2, std::min(1000, points));
        
        if (start >= end) {
            start = 0.01;
            end = 1e6;
        }
        
        std::vector<double> frequencies;
        frequencies.reserve(points);
        
        double logStart = std::log10(start);
        double logEnd = std::log10(end);
        double step = (logEnd - logStart) / (points - 1);

        for (int i = 0; i < points; ++i) {
            double logFreq = logStart + step * i;
            double freq = std::pow(10.0, logFreq);
            frequencies.push_back(isInvalidNumber(freq) ? 1.0 : freq);
        }
        return frequencies;
    }

    static Napi::Object calculateNoise(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            Napi::Object result = Napi::Object::New(env);
            std::vector<double> freqs = calculateFrequencies(1.0, 1e6, 100);
            Napi::Array freqArray = Napi::Array::New(env, 100);
            Napi::Array zeroArray = Napi::Array::New(env, 100);
            for (int i = 0; i < 100; ++i) {
                freqArray.Set(i, Napi::Number::New(env, freqs[i]));
                zeroArray.Set(i, Napi::Number::New(env, 0.0));
            }
            result.Set("frequencies", freqArray);
            result.Set("totalNoiseSpectralDensity", zeroArray);
            result.Set("resistorNoiseSpectralDensity", zeroArray);
            result.Set("opampVoltageNoiseSpectralDensity", zeroArray);
            result.Set("opampCurrentNoiseSpectralDensity", zeroArray);
            return result;
        }

        Napi::Object circuitData = info[0].As<Napi::Object>();
        
        double startFreq = 1.0, endFreq = 1e6;
        int numPoints = 100;
        
        if (circuitData.Has("frequencyRange") && circuitData.Get("frequencyRange").IsObject()) {
            Napi::Object freqRange = circuitData.Get("frequencyRange").As<Napi::Object>();
            startFreq = safeDouble(freqRange.Get("start"), 1.0);
            endFreq = safeDouble(freqRange.Get("end"), 1e6);
            numPoints = safeInt(freqRange.Get("points"), 100);
        }

        std::vector<double> frequencies = calculateFrequencies(startFreq, endFreq, numPoints);
        int actualPoints = static_cast<int>(frequencies.size());
        
        std::vector<double> totalNoise(actualPoints, 0.0);
        std::vector<double> resistorNoise(actualPoints, 0.0);
        std::vector<double> opampVoltageNoise(actualPoints, 0.0);
        std::vector<double> opampCurrentNoise(actualPoints, 0.0);

        const double BOLTZMANN_CONSTANT = 1.380649e-23;
        const double MAX_NOISE = 1e-6;
        const double MAX_TOTAL_NOISE = 1e-4;

        if (circuitData.Has("elements") && circuitData.Get("elements").IsArray()) {
            Napi::Array elements = circuitData.Get("elements").As<Napi::Array>();
            
            for (uint32_t i = 0; i < elements.Length(); ++i) {
                if (!elements.Get(i).IsObject()) continue;
                
                Napi::Object element = elements.Get(i).As<Napi::Object>();
                if (!element.Has("type") || !element.Get("type").IsString()) continue;
                
                std::string type = element.Get("type").As<Napi::String>().Utf8Value();
                double value = safeDouble(element.Get("value"), 0.0);
                value = clamp(value, 0.0, 1e12);

                if (type == "resistor") {
                    double temp = 300.0;
                    if (element.Has("params") && element.Get("params").IsObject()) {
                        Napi::Object params = element.Get("params").As<Napi::Object>();
                        temp = safeDouble(params.Get("temperature"), 300.0);
                    }
                    temp = clamp(temp, 0.01, 10000.0);
                    
                    Resistor resistor(value, temp);
                    double noisePerFreq = resistor.getNoiseSpectralDensity(0);
                    noisePerFreq = isInvalidNumber(noisePerFreq) ? 0.0 : clamp(noisePerFreq, 0.0, MAX_NOISE);
                    
                    for (int j = 0; j < actualPoints; ++j) {
                        resistorNoise[j] = clamp(resistorNoise[j] + noisePerFreq, 0.0, MAX_TOTAL_NOISE);
                        totalNoise[j] = clamp(totalNoise[j] + noisePerFreq, 0.0, MAX_TOTAL_NOISE);
                    }
                } else if (type == "opamp") {
                    double vn = 10e-9, in_val = 1e-12, fc = 100.0;
                    if (element.Has("params") && element.Get("params").IsObject()) {
                        Napi::Object params = element.Get("params").As<Napi::Object>();
                        vn = safeDouble(params.Get("voltageNoise"), 10e-9);
                        in_val = safeDouble(params.Get("currentNoise"), 1e-12);
                        fc = safeDouble(params.Get("cornerFrequency"), 100.0);
                    }
                    vn = clamp(vn, 1e-12, 1e-3);
                    in_val = clamp(in_val, 1e-18, 1e-6);
                    fc = clamp(fc, 0.01, 1e6);

                    OpAmp opamp(vn, in_val, fc);
                    for (int j = 0; j < actualPoints; ++j) {
                        double freq = frequencies[j];
                        double flickerFactor = 1.0 + (fc / freq);
                        flickerFactor = isInvalidNumber(flickerFactor) ? 1.0 : clamp(flickerFactor, 1.0, 1e6);
                        
                        double vNoise = opamp.getNoiseSpectralDensity(freq);
                        vNoise = isInvalidNumber(vNoise) ? 0.0 : clamp(vNoise, 0.0, MAX_NOISE);
                        
                        opampVoltageNoise[j] = clamp(opampVoltageNoise[j] + vNoise, 0.0, MAX_TOTAL_NOISE);
                        totalNoise[j] = clamp(totalNoise[j] + vNoise, 0.0, MAX_TOTAL_NOISE);
                    }
                }
            }
        }

        for (int j = 0; j < actualPoints; ++j) {
            if (isInvalidNumber(totalNoise[j])) totalNoise[j] = 0.0;
            if (isInvalidNumber(resistorNoise[j])) resistorNoise[j] = 0.0;
            if (isInvalidNumber(opampVoltageNoise[j])) opampVoltageNoise[j] = 0.0;
            if (isInvalidNumber(opampCurrentNoise[j])) opampCurrentNoise[j] = 0.0;
        }

        Napi::Object result = Napi::Object::New(env);
        Napi::Array freqArray = Napi::Array::New(env, actualPoints);
        Napi::Array totalNoiseArray = Napi::Array::New(env, actualPoints);
        Napi::Array resistorNoiseArray = Napi::Array::New(env, actualPoints);
        Napi::Array opampVoltageNoiseArray = Napi::Array::New(env, actualPoints);
        Napi::Array opampCurrentNoiseArray = Napi::Array::New(env, actualPoints);

        for (int i = 0; i < actualPoints; ++i) {
            freqArray.Set(i, Napi::Number::New(env, frequencies[i]));
            totalNoiseArray.Set(i, Napi::Number::New(env, totalNoise[i]));
            resistorNoiseArray.Set(i, Napi::Number::New(env, resistorNoise[i]));
            opampVoltageNoiseArray.Set(i, Napi::Number::New(env, opampVoltageNoise[i]));
            opampCurrentNoiseArray.Set(i, Napi::Number::New(env, opampCurrentNoise[i]));
        }

        result.Set("frequencies", freqArray);
        result.Set("totalNoiseSpectralDensity", totalNoiseArray);
        result.Set("resistorNoiseSpectralDensity", resistorNoiseArray);
        result.Set("opampVoltageNoiseSpectralDensity", opampVoltageNoiseArray);
        result.Set("opampCurrentNoiseSpectralDensity", opampCurrentNoiseArray);

        return result;
    }

    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        exports.Set(Napi::String::New(env, "calculateNoise"),
                    Napi::Function::New(env, calculateNoise));
        return exports;
    }
};

NODE_API_MODULE(noise_calculator, NoiseCalculator::Init)
