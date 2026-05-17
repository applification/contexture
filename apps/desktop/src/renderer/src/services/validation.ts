/** Renderer adapter for core IR semantic validation. */
import { checkSemantic, type SemanticIssue } from '@contexture/core/semantic-validation';
import type { StdlibRegistry } from '@shared/stdlib-registry';
import type { Schema } from '../model/ir';

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface ValidateOptions {
  /**
   * Optional stdlib registry used to resolve qualified refs
   * (`<namespace>.<TypeName>`) against bundled stdlib namespaces when
   * no matching `add_import` has been declared, and to validate that
   * stdlib imports point at known namespaces with matching aliases.
   */
  stdlib?: StdlibRegistry;
}

export function validate(schema: Schema, options: ValidateOptions = {}): ValidationError[] {
  if (!schema || schema.version !== '1') return [];
  return checkSemantic(schema, options.stdlib).map(toValidationError);
}

function toValidationError(issue: SemanticIssue): ValidationError {
  return {
    code: issue.code,
    path: issue.path,
    message: issue.hint ? `${issue.message} ${issue.hint}` : issue.message,
  };
}
