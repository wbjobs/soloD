#include <stdio.h>
#include <stdlib.h>
#include <math.h>

double position(double x) {
    return (sin(x) + cos(x));
}

double velocity(double x) {
    return (cos(x) + (-sin(x)));
}

double acceleration(double x) {
    return ((-sin(x)) + (-cos(x)));
}

int main(int argc, char *argv[]) {
    double t = atof(argv[1]);
    double pos = position(t);
    double vel = velocity(t);
    double acc = acceleration(t);
    printf("%f\n", pos);
    printf("%f\n", vel);
    printf("%f\n", acc);
    return 0;
}