#include <stdio.h>
#include <stdlib.h>
#include <math.h>

double f(double a, double b) {
    return ((pow((a - 1), 2) + pow((b - 2), 2)) + 10);
}

double df_da(double a, double b) {
    return (2 * (a - 1));
}

double df_db(double a, double b) {
    return (2 * (b - 2));
}

int main(int argc, char *argv[]) {
    double x = atof(argv[1]);
    double y = atof(argv[2]);
    double lr = atof(argv[3]);
    double current_val = f(x, y);
    double grad_x = df_da(x, y);
    double grad_y = df_db(x, y);
    double new_x = (x - (lr * grad_x));
    double new_y = (y - (lr * grad_y));
    double new_val = f(new_x, new_y);
    printf("%f\n", current_val);
    printf("%f\n", grad_x);
    printf("%f\n", grad_y);
    printf("%f\n", new_val);
    return 0;
}