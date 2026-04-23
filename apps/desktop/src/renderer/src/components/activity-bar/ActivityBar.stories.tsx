import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ActivityBar } from './ActivityBar';

const meta = {
  title: 'Components/ActivityBar',
  component: ActivityBar,
  args: {
    activeTab: 'properties',
    onTabChange: fn(),
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ActivityBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Properties: Story = {
  args: { activeTab: 'properties' },
};

export const Chat: Story = {
  args: { activeTab: 'chat' },
};

export const Schema: Story = {
  args: { activeTab: 'schema' },
};

export const Eval: Story = {
  args: { activeTab: 'eval' },
};
