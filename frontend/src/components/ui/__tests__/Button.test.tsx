/**
 * The shared button on a touch screen.
 *
 * An icon-only button was 32 pixels wide and a small one about 32 tall,
 * under the 44 by 44 a finger needs. Both carry `touch-target` (index.css),
 * which sets that minimum only where the primary pointer is coarse, so a
 * mouse keeps their sizes. jsdom evaluates no media query: what can be
 * checked here is the class; the sizes are measured in a browser.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pencil } from 'lucide-react';
import Button from '../Button';

const classesOf = (el: Element) => el.className.split(/\s+/);

describe('Button on a touch screen', () => {
  it('sizes an icon-only button for a finger', () => {
    render(<Button iconOnly icon={Pencil} aria-label="Edit" />);

    expect(classesOf(screen.getByRole('button', { name: 'Edit' }))).toContain('touch-target');
  });

  // The map's toolbar passes its icon as a child, which the browser lays out
  // as a block: in the wider box it would sit at the left.
  it('centres an icon passed as a child in the bigger box', () => {
    render(<Button iconOnly aria-label="Zoom In"><Pencil className="w-4 h-4" /></Button>);

    expect(classesOf(screen.getByRole('button', { name: 'Zoom In' }))).toContain('pointer-coarse:[&>svg]:mx-auto');
  });

  it('sizes a small button for a finger', () => {
    render(<Button size="sm">Put back</Button>);

    expect(classesOf(screen.getByRole('button', { name: 'Put back' }))).toContain('touch-target');
  });

  // A regular button is already 42 pixels tall, and a large one taller.
  it('leaves the regular and large sizes alone', () => {
    render(<><Button>Save</Button><Button size="lg">Start Combat</Button></>);

    expect(classesOf(screen.getByRole('button', { name: 'Save' }))).not.toContain('touch-target');
    expect(classesOf(screen.getByRole('button', { name: 'Start Combat' }))).not.toContain('touch-target');
  });
});
