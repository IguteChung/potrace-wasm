/* Copyright (C) 2001-2019 Peter Selinger.
   This file is part of Potrace. It is free software and it is covered
   by the GNU General Public License. See the file COPYING for details. */

/* The SVG backend of Potrace. */

#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <math.h>

#include "potracelib.h"
#include "curve.h"
#include "potrace.h"
#include "backend_svg.h"
#include "lists.h"
#include "auxiliary.h"

#define UNIT 10

/* ---------------------------------------------------------------------- */
/* path-drawing auxiliary functions */

/* coordinate quantization */
static inline point_t unit(dpoint_t p)
{
  point_t q;

  q.x = (long)(floor(p.x * UNIT + .5));
  q.y = (long)(floor(p.y * UNIT + .5));
  return q;
}

static point_t cur;
static char lastop = 0;
static int column = 0;
static int newline = 1;

static void shiptoken(FILE *fout, const char *token)
{
  int c = strlen(token);
  if (!newline && column + c + 1 > 75)
  {
    fprintf(fout, " ");
    column = 0;
    newline = 1;
  }
  else if (!newline)
  {
    fprintf(fout, " ");
    column++;
  }
  fprintf(fout, "%s", token);
  column += c;
  newline = 0;
}

static void ship(FILE *fout, const char *fmt, ...)
{
  va_list args;
  static char buf[4096]; /* static string limit is okay here because
			    we only use constant format strings - for
			    the same reason, it is okay to use
			    vsprintf instead of vsnprintf below. */
  char *p, *q;

  va_start(args, fmt);
  vsprintf(buf, fmt, args);
  buf[4095] = 0;
  va_end(args);

  p = buf;
  while ((q = strchr(p, ' ')) != NULL)
  {
    *q = 0;
    shiptoken(fout, p);
    p = q + 1;
  }
  shiptoken(fout, p);
}

static void svg_moveto(FILE *fout, dpoint_t p)
{
  cur = unit(p);

  ship(fout, "M%ld %ld", cur.x, cur.y);
  lastop = 'M';
}

static void svg_rmoveto(FILE *fout, dpoint_t p)
{
  point_t q;

  q = unit(p);
  ship(fout, "m%ld %ld", q.x - cur.x, q.y - cur.y);
  cur = q;
  lastop = 'm';
}

static void svg_lineto(FILE *fout, dpoint_t p)
{
  point_t q;

  q = unit(p);

  if (lastop != 'l')
  {
    ship(fout, "l%ld %ld", q.x - cur.x, q.y - cur.y);
  }
  else
  {
    ship(fout, "%ld %ld", q.x - cur.x, q.y - cur.y);
  }
  cur = q;
  lastop = 'l';
}

static void svg_curveto(FILE *fout, dpoint_t p1, dpoint_t p2, dpoint_t p3)
{
  point_t q1, q2, q3;

  q1 = unit(p1);
  q2 = unit(p2);
  q3 = unit(p3);

  if (lastop != 'c')
  {
    ship(fout, "c%ld %ld %ld %ld %ld %ld", q1.x - cur.x, q1.y - cur.y, q2.x - cur.x, q2.y - cur.y, q3.x - cur.x, q3.y - cur.y);
  }
  else
  {
    ship(fout, "%ld %ld %ld %ld %ld %ld", q1.x - cur.x, q1.y - cur.y, q2.x - cur.x, q2.y - cur.y, q3.x - cur.x, q3.y - cur.y);
  }
  cur = q3;
  lastop = 'c';
}

/* ---------------------------------------------------------------------- */
/* functions for converting a path to an SVG path element */

/* Explicit encoding. If abs is set, move to first coordinate
   absolutely. */
static int svg_path(FILE *fout, potrace_curve_t *curve, int abs)
{
  int i;
  dpoint_t *c;
  int m = curve->n;

  c = curve->c[m - 1];
  if (abs)
  {
    svg_moveto(fout, c[2]);
  }
  else
  {
    svg_rmoveto(fout, c[2]);
  }

  for (i = 0; i < m; i++)
  {
    c = curve->c[i];
    switch (curve->tag[i])
    {
    case POTRACE_CORNER:
      svg_lineto(fout, c[1]);
      svg_lineto(fout, c[2]);
      break;
    case POTRACE_CURVETO:
      svg_curveto(fout, c[0], c[1], c[2]);
      break;
    }
  }
  newline = 1;
  shiptoken(fout, "z");
  return 0;
}

/* produce a jaggy path - for debugging. If abs is set, move to first
   coordinate absolutely. If abs is not set, move to first coordinate
   relatively, and traverse path in the opposite direction. */
static int svg_jaggy_path(FILE *fout, point_t *pt, int n, int abs)
{
  int i;
  point_t cur, prev;

  if (abs)
  {
    cur = prev = pt[n - 1];
    svg_moveto(fout, dpoint(cur));
    for (i = 0; i < n; i++)
    {
      if (pt[i].x != cur.x && pt[i].y != cur.y)
      {
        cur = prev;
        svg_lineto(fout, dpoint(cur));
      }
      prev = pt[i];
    }
    svg_lineto(fout, dpoint(pt[n - 1]));
  }
  else
  {
    cur = prev = pt[0];
    svg_rmoveto(fout, dpoint(cur));
    for (i = n - 1; i >= 0; i--)
    {
      if (pt[i].x != cur.x && pt[i].y != cur.y)
      {
        cur = prev;
        svg_lineto(fout, dpoint(cur));
      }
      prev = pt[i];
    }
    svg_lineto(fout, dpoint(pt[0]));
  }
  newline = 1;
  shiptoken(fout, "z");
  return 0;
}

static void write_paths_opaque(FILE *fout, potrace_path_t *tree)
{
  potrace_path_t *p, *q;

  for (p = tree; p; p = p->sibling)
  {
    column = fprintf(fout, "<path fill=\"#000000\" stroke=\"none\" d=\"");
    newline = 1;
    lastop = 0;
    svg_path(fout, &p->curve, 1);
    fprintf(fout, "\"/>");
    for (q = p->childlist; q; q = q->sibling)
    {
      column = fprintf(fout, "<path fill=\"#ffffff\" stroke=\"none\" d=\"");
      newline = 1;
      lastop = 0;
      svg_path(fout, &q->curve, 1);
      fprintf(fout, "\"/>");
    }
    for (q = p->childlist; q; q = q->sibling)
    {
      write_paths_opaque(fout, q->childlist);
    }
  }
}

static void write_paths_transparent_rec(FILE *fout, potrace_path_t *tree)
{
  potrace_path_t *p, *q;

  for (p = tree; p; p = p->sibling)
  {
    column = fprintf(fout, "<path d=\"");
    newline = 1;
    lastop = 0;

    svg_path(fout, &p->curve, 1);

    for (q = p->childlist; q; q = q->sibling)
    {
      svg_path(fout, &q->curve, 0);
    }

    fprintf(fout, "\"/>");

    for (q = p->childlist; q; q = q->sibling)
    {
      write_paths_transparent_rec(fout, q->childlist);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Backend. */

/* public interface for SVG */
int page_svg(FILE *fout, potrace_path_t *plist, imginfo_t *imginfo)
{

  double bboxx = imginfo->trans.bb[0] + imginfo->lmar + imginfo->rmar;
  double bboxy = imginfo->trans.bb[1] + imginfo->tmar + imginfo->bmar;
  double origx = imginfo->trans.orig[0] + imginfo->lmar;
  double origy = bboxy - imginfo->trans.orig[1] - imginfo->bmar;
  double scalex = imginfo->trans.scalex / UNIT;
  double scaley = -imginfo->trans.scaley / UNIT;

  /* header */
  fprintf(fout, "<?xml version=\"1.0\" standalone=\"no\"?>");
  fprintf(fout, "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 20010904//EN\"");
  fprintf(fout, " \"http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd\">");

  /* set bounding box and namespace */
  fprintf(fout, "<svg version=\"1.0\" xmlns=\"http://www.w3.org/2000/svg\"");
  fprintf(fout, " width=\"%f\" height=\"%f\" viewBox=\"0 0 %f %f\"",
          bboxx, bboxy, bboxx, bboxy);
  fprintf(fout, " preserveAspectRatio=\"xMidYMid meet\">");

  /* use a "group" tag to establish coordinate system and style */
  fprintf(fout, "<g transform=\"");
  if (origx != 0 || origy != 0)
  {
    fprintf(fout, "translate(%f,%f) ", origx, origy);
  }
  fprintf(fout, "scale(%f,%f)\" ", scalex, scaley);
  fprintf(fout, "fill=\"#000000\" stroke=\"none\">");

  write_paths_transparent_rec(fout, plist);

  /* write footer */
  fprintf(fout, "</g>");
  fprintf(fout, "</svg>");
  fflush(fout);

  return 0;
}