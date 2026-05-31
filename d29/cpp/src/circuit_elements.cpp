#include "circuit_elements.h"

#ifdef _MSC_VER
#include <float.h>
#endif

namespace {
    inline bool isInvalidNumber(double value) {
#ifdef _MSC_VER
        return _isnan(value) != 0 || !_finite(value);
#else
        return std::isnan(value) || std::isinf(value);
#endif
    }

    inline double clamp(double value, double min_val, double max_val) {
        if (isInvalidNumber(value)) return min_val;
        return value < min_val ? min_val : (value > max_val ? max_val : value);
    }
}

CircuitElement::CircuitElement(Type type, double value, const std::string& label)
    : type_(type), value_(value), label_(label) {}

const double Resistor::BOLTZMANN_CONSTANT = 1.380649e-23;

Resistor::Resistor(double resistance, double temperature)
    : CircuitElement(RESISTOR, clamp(resistance, 0.0, 1e12)), 
      temperature_(clamp(temperature, 0.01, 10000.0)) {}

double Resistor::getNoiseSpectralDensity(double /*frequency*/) const {
    double result = 4.0 * BOLTZMANN_CONSTANT * temperature_ * value_;
    return isInvalidNumber(result) ? 0.0 : result;
}

Capacitor::Capacitor(double capacitance)
    : CircuitElement(CAPACITOR, clamp(capacitance, 0.0, 10.0)) {}

double Capacitor::getNoiseSpectralDensity(double /*frequency*/) const {
    return 0.0;
}

OpAmp::OpAmp(double voltageNoiseDensity, double currentNoiseDensity, double cornerFrequency)
    : CircuitElement(OPAMP, 0.0),
      voltageNoiseDensity_(clamp(voltageNoiseDensity, 1e-12, 1e-3)),
      currentNoiseDensity_(clamp(currentNoiseDensity, 1e-18, 1e-6)),
      cornerFrequency_(clamp(cornerFrequency, 0.01, 1e6)) {}

double OpAmp::getNoiseSpectralDensity(double frequency) const {
    double safeFreq = clamp(frequency, 0.01, 1e12);
    double flickerFactor = 1.0 + (cornerFrequency_ / safeFreq);
    flickerFactor = clamp(flickerFactor, 1.0, 1e6);
    double voltageNoiseSquared = voltageNoiseDensity_ * voltageNoiseDensity_ * flickerFactor;
    return isInvalidNumber(voltageNoiseSquared) ? 0.0 : voltageNoiseSquared;
}
