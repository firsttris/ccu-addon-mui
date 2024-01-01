import isPropValid from '@emotion/is-prop-valid';
import { styled as muiStyled, CreateMUIStyled } from '@mui/system';


export const styledWithForward: CreateMUIStyled = (component: any, options: any) => {
  return muiStyled(component, {
    shouldForwardProp: (prop: string | number) => typeof prop === 'string' && isPropValid(prop),
    ...options,
  });
};