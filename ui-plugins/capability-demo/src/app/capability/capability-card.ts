import { Component, input } from '@angular/core';
import { Card } from 'primeng/card';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { capabilityBadge, declarationCode } from './capability-catalog';
import type { CapabilityBadge } from './capability-catalog';
import type { CapabilityDef } from './capability-types';
import { CapabilityDemo } from './demos/capability-demo';

@Component({
  selector: 'app-capability-card',
  imports: [Card, Tag, Tooltip, CapabilityDemo],
  templateUrl: './capability-card.html',
  styleUrl: './capability-card.scss',
})
export class CapabilityCard {
  readonly def = input.required<CapabilityDef>();
  readonly hostUrl = input<string | null>(null);

  protected readonly badge: CapabilityBadge = capabilityBadge();

  protected code(): string {
    return declarationCode(this.def());
  }
}
