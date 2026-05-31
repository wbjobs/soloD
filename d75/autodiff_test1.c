#include <stdio.h>
#include <stdlib.h>
#include <math.h>

double f(double a, double b) {
    return ((pow(a, 2) + ((2 * a) * b)) + pow(b, 2));
}

double df_da(double a, double b) {
    return ((2 * a) + (2 * b));
}

double df_db(double a, double b) {
    return ((2 * a) + (2 * b));
}

int main(int argc, char *argv[]) {
    double x = atof(argv[1]);
    double y = atof(argv[2]);
    double val = f(x, y);
    double dval_dx = df_da(x, y);
    double dval_dy = df_db(x, y);
    printf("%f\n", val);
    printf("%f\n", dval_dx);
    printf("%f\n", dval_dy);
    return 0;
}