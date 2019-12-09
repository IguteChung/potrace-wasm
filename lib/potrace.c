#include <stdio.h>
#include <stdint.h>

const char *convert_svg(uint8_t pixels[], int width, int height)
{
    printf("potrace receives %d bytes\n", width * height);
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\">"
           "<path d=\"M10 10 L 60 10 L 60 60 L 10 60z\"/>"
           "</svg>";
}