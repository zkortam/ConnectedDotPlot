import {
  AppliedPrompts,
  Context,
  onDrillDownFunction,
  ResponseData,
  TContext
} from '@incorta-org/component-sdk';
import React from 'react';

interface Props {
  context: Context<TContext>;
  prompts: AppliedPrompts;
  data: ResponseData;
  drillDown: onDrillDownFunction;
}

const ConnectedDotPlot = ({ context, prompts, data, drillDown }: Props) => {
  console.log({ context, prompts, data, drillDown });
  return (
    <div className="test">
      <h1>Hello Incorta Component</h1>
    </div>
  );
};

export default ConnectedDotPlot;
