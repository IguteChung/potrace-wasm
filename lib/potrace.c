#include <stdio.h>
#include <stdint.h>

const char *convert_svg(uint8_t pixels[], int width, int height)
{
    printf("potrace receives %d bytes\n", width * height);
    return "<svg></svg>";
}