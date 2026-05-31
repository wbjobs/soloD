#include <stdio.h>
#include <stdlib.h>
#include <math.h>

int main(int argc, char *argv[]) {
    double x = atof(argv[1]);
    double y = atof(argv[2]);
    double a = (x + (y * 2));
    double b = pow((x - y), 2);
    double c = sqrt((pow(a, 2) + pow(b, 2)));
    double d = (sin(x) + cos(y));
    double e = exp((pow((-x), 2) / 2));
    printf("%f\n", a);
    printf("%f\n", b);
    printf("%f\n", c);
    printf("%f\n", d);
    printf("%f\n", e);
    return 0;
}