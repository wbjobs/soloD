#pragma once

#ifdef _WIN32
#include <SDKDDKVer.h>
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#endif

#include <vector>
#include <string>
#include <cmath>

class CircuitElement {
public:
    enum Type { RESISTOR, CAPACITOR, OPAMP, VOLTAGE_SOURCE, GROUND };

    CircuitElement(Type type, double value, const std::string& label = "");
    virtual ~CircuitElement() = default;

    Type getType() const { return type_; }
    double getValue() const { return value_; }
    void setValue(double value) { value_ = value; }
    std::string getLabel() const { return label_; }

    virtual double getNoiseSpectralDensity(double frequency) const = 0;

protected:
    Type type_;
    double value_;
    std::string label_;
};

class Resistor : public CircuitElement {
public:
    Resistor(double resistance, double temperature = 300.0);
    double getNoiseSpectralDensity(double frequency) const override;
    void setTemperature(double temperature) { temperature_ = temperature; }
    double getTemperature() const { return temperature_; }

private:
    double temperature_;
    static const double BOLTZMANN_CONSTANT;
};

class Capacitor : public CircuitElement {
public:
    Capacitor(double capacitance);
    double getNoiseSpectralDensity(double frequency) const override;
};

class OpAmp : public CircuitElement {
public:
    OpAmp(double voltageNoiseDensity = 10e-9,
          double currentNoiseDensity = 1e-12,
          double cornerFrequency = 100.0);
    double getNoiseSpectralDensity(double frequency) const override;
    double getVoltageNoiseDensity() const { return voltageNoiseDensity_; }
    double getCurrentNoiseDensity() const { return currentNoiseDensity_; }
    double getCornerFrequency() const { return cornerFrequency_; }

private:
    double voltageNoiseDensity_;
    double currentNoiseDensity_;
    double cornerFrequency_;
};
